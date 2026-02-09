/**
 * S3 Vectors セマンティック検索クライアント
 *
 * S3 Vectors (newfan-finance-vectors / prna-articles) に対してクエリを実行し、
 * 検索結果の article_id を用いて DynamoDB から記事全文を取得する。
 *
 * アーキテクチャ:
 *   1. クエリテキスト → Gemini Embedding (3072 次元)
 *   2. S3 Vectors QueryVectors → article_id + メタデータ
 *   3. DynamoDB BatchGetItem → 記事全文 (content, title, url 等)
 *   4. LangChain Document[] として返却
 *
 * 設計方針:
 *   - S3 Vectors には軽量メタデータのみ格納 (~0.5KB)
 *   - 記事本文は DynamoDB をSingle Source of Truth として取得
 *   - article_id = url_hash = DynamoDB PK
 */

import {
  S3VectorsClient,
  QueryVectorsCommand,
} from '@aws-sdk/client-s3vectors';
import { BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoClient } from './dynamodb-client';
import { Document } from 'langchain/document';

// --- 設定 ---

const VECTOR_BUCKET =
  process.env.S3_VECTORS_BUCKET || 'newfan-finance-vectors';
const VECTOR_INDEX = process.env.S3_VECTORS_INDEX || 'prna-articles';
const REGION = process.env.AWS_REGION || 'ap-northeast-1';
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'prna-articles';

/** Gemini Embedding API の設定 */
const EMBEDDING_API_KEY =
  process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const EMBEDDING_DIMENSION = 3072;

// --- S3 Vectors クライアント (シングルトン) ---

const getS3VectorsClient = (() => {
  let client: S3VectorsClient | null = null;
  return () => {
    if (!client) {
      const config: {
        region: string;
        credentials?: { accessKeyId: string; secretAccessKey: string };
      } = { region: REGION };

      if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        config.credentials = {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        };
      }

      client = new S3VectorsClient(config);
    }
    return client;
  };
})();

// --- 型定義 ---

/** S3 Vectors 検索結果 */
export interface VectorSearchResult {
  /** S3 Vectors キー (= DynamoDB url_hash) */
  key: string;
  /** コサイン距離 (0 に近いほど類似) */
  distance: number;
  /** S3 Vectors メタデータ */
  metadata: {
    article_id: string;
    title: string;
    url: string;
    category: string;
    pub_date: string;
  };
}

/** S3 Vectors 検索オプション */
export interface SearchOptions {
  /** 取得件数 (デフォルト: 10) */
  topK?: number;
  /** カテゴリフィルタ */
  category?: string;
}

// --- Embedding 生成 ---

/**
 * Gemini gemini-embedding-001 でクエリの Embedding を生成
 *
 * Next.js (Vercel) からの呼び出し用。
 * Lambda 側の embedding-client.ts と同じモデル・パラメータを使用。
 */
export async function generateQueryEmbedding(
  text: string,
): Promise<number[]> {
  if (!EMBEDDING_API_KEY) {
    throw new Error(
      'GEMINI_API_KEY or GOOGLE_API_KEY is not set for embedding generation',
    );
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${EMBEDDING_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/gemini-embedding-001',
      content: { parts: [{ text }] },
      outputDimensionality: EMBEDDING_DIMENSION,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Embedding API error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    embedding?: { values?: number[] };
  };

  if (!data.embedding?.values || !Array.isArray(data.embedding.values)) {
    throw new Error(
      `Unexpected Gemini response: ${JSON.stringify(data).slice(0, 200)}`,
    );
  }

  return data.embedding.values;
}

// --- S3 Vectors 検索 ---

/**
 * S3 Vectors でセマンティック検索を実行
 *
 * @param queryVector - クエリの Embedding ベクトル (3072 次元)
 * @param options - 検索オプション (topK, category フィルタ)
 * @returns 検索結果の配列 (距離昇順)
 */
export async function queryVectors(
  queryVector: number[],
  options: SearchOptions = {},
): Promise<VectorSearchResult[]> {
  const { topK = 10, category } = options;
  const client = getS3VectorsClient();

  const commandInput: {
    vectorBucketName: string;
    indexName: string;
    queryVector: { float32: number[] };
    topK: number;
    returnDistance: boolean;
    returnMetadata: boolean;
    filter?: Record<string, string>;
  } = {
    vectorBucketName: VECTOR_BUCKET,
    indexName: VECTOR_INDEX,
    queryVector: { float32: queryVector },
    topK,
    returnDistance: true,
    returnMetadata: true,
  };

  if (category) {
    commandInput.filter = { category };
  }

  const response = await client.send(
    new QueryVectorsCommand(commandInput),
  );

  return (response.vectors || []).map((v) => ({
    key: v.key!,
    distance: v.distance ?? 1,
    metadata: {
      article_id: (v.metadata as Record<string, string>)?.article_id || v.key!,
      title: (v.metadata as Record<string, string>)?.title || '',
      url: (v.metadata as Record<string, string>)?.url || '',
      category: (v.metadata as Record<string, string>)?.category || '',
      pub_date: (v.metadata as Record<string, string>)?.pub_date || '',
    },
  }));
}

// --- DynamoDB 記事全文取得 ---

/**
 * DynamoDB から記事を一括取得 (BatchGetItem)
 *
 * S3 Vectors の検索結果に含まれる article_id (= url_hash) を使用して
 * DynamoDB から記事全文を取得する。
 *
 * @param urlHashes - url_hash の配列 (最大 100 件)
 * @returns url_hash をキーとした記事マップ
 */
async function batchGetArticles(
  urlHashes: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const result = new Map<string, Record<string, unknown>>();
  if (urlHashes.length === 0) return result;

  // BatchGetItem の上限は 100 件
  const BATCH_SIZE = 100;

  for (let i = 0; i < urlHashes.length; i += BATCH_SIZE) {
    const batch = urlHashes.slice(i, i + BATCH_SIZE);

    const response = await dynamoClient.send(
      new BatchGetCommand({
        RequestItems: {
          [TABLE_NAME]: {
            Keys: batch.map((hash) => ({ url_hash: hash })),
            ProjectionExpression:
              'url_hash, title, #u, content, category, pubDate, author, thumbnail',
            ExpressionAttributeNames: { '#u': 'url' },
          },
        },
      }),
    );

    const items = response.Responses?.[TABLE_NAME] || [];
    for (const item of items) {
      result.set(item.url_hash as string, item);
    }
  }

  return result;
}

// --- メイン検索関数 ---

/**
 * S3 Vectors セマンティック検索 → DynamoDB 全文取得 → LangChain Document[]
 *
 * MetaSearchAgent から呼び出されるメイン関数。
 * クエリテキストから Embedding を生成し、S3 Vectors で類似検索を行い、
 * 結果の article_id で DynamoDB から記事全文を取得して Document[] に変換する。
 *
 * @param query - 検索クエリ文字列
 * @param options - 検索オプション
 * @returns LangChain Document の配列 (metadata に title, url, category, pub_date を含む)
 */
export async function searchArticles(
  query: string,
  options: SearchOptions = {},
): Promise<Document[]> {
  // 1. クエリ Embedding 生成
  const queryVector = await generateQueryEmbedding(query);

  // 2. S3 Vectors でセマンティック検索
  const vectorResults = await queryVectors(queryVector, options);

  if (vectorResults.length === 0) {
    return [];
  }

  // 3. DynamoDB から記事全文を BatchGet
  const articleIds = vectorResults.map((r) => r.metadata.article_id);
  const articlesMap = await batchGetArticles(articleIds);

  // 4. LangChain Document[] に変換 (検索順序を維持)
  const documents: Document[] = [];

  for (const result of vectorResults) {
    const article = articlesMap.get(result.metadata.article_id);

    if (article) {
      // 記事本文から HTML を除去してプレーンテキストに
      const content = stripHtml(article.content as string || '');
      const title = article.title as string || result.metadata.title;

      documents.push(
        new Document({
          pageContent: `${title}\n\n${content}`.slice(0, 4000),
          metadata: {
            title,
            url: (article.url as string) || result.metadata.url,
            category: result.metadata.category,
            pub_date: result.metadata.pub_date,
            distance: result.distance,
            article_id: result.metadata.article_id,
            ...(article.thumbnail ? { img_src: article.thumbnail as string } : {}),
          },
        }),
      );
    } else {
      // DynamoDB にデータがない場合 (稀ケース) はメタデータのみで Document 生成
      documents.push(
        new Document({
          pageContent: result.metadata.title,
          metadata: {
            title: result.metadata.title,
            url: result.metadata.url,
            category: result.metadata.category,
            pub_date: result.metadata.pub_date,
            distance: result.distance,
            article_id: result.metadata.article_id,
          },
        }),
      );
    }
  }

  return documents;
}

// --- ユーティリティ ---

/**
 * HTML タグを除去してプレーンテキストを抽出
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
