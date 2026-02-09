/**
 * DynamoDB Streams から受け取った記事データを
 * S3 Vectors 投入用に前処理するモジュール
 *
 * DynamoDB テーブル (prna-articles) のレコードフォーマットに準拠:
 *   PK: url_hash (SHA-256)
 *   GSI: category-pubDateEpoch-index
 *
 * 設計方針: 軽量メタデータ + DynamoDB ルックアップ
 *   - 記事本文 (source_text) は S3 Vectors に格納しない (40KB 制限回避)
 *   - vectorKey = url_hash = DynamoDB PK
 *   - 検索後に article_id で DynamoDB から全文を取得
 */

/**
 * DynamoDB に格納された記事レコード (unmarshall 済み)
 *
 * ※ prna-article-ingestor の article-processor.ts で定義された
 *   ProcessedArticle と同一の属性セット
 */
export interface DynamoDBArticleRecord {
  url_hash: string;        // PK — SHA-256 of normalized URL
  title_hash: string;      // SHA-256 of normalized title (重複検出用)
  url: string;             // 記事 URL
  title: string;           // 記事タイトル (HTML デコード済み)
  content: string;         // 記事本文 (HTML)
  thumbnail?: string;      // サムネイル画像 URL
  pubDate: string;         // 公開日 (ISO 8601)
  pubDateEpoch: number;    // 公開日 (Unix タイムスタンプ)
  author?: string;         // 著者名
  category: string;        // カテゴリ
  s3Key: string;           // 元の S3 オブジェクトキー
  createdAt: string;       // 作成日時 (ISO 8601)
  updatedAt: string;       // 更新日時 (ISO 8601)
  ttl: number;             // TTL (epoch seconds)
}

/**
 * S3 Vectors 投入用に前処理された記事データ
 *
 * 軽量メタデータ設計 (~0.5KB):
 *   - Filterable: category, pub_date (クエリフィルタ用)
 *   - Non-filterable: article_id, title, url (即時表示 + DynamoDB ルックアップ用)
 */
export interface ProcessedArticle {
  /** url_hash — S3 Vectors キー & DynamoDB PK */
  vectorKey: string;
  /** Embedding 生成用テキスト (タイトル + 本文) */
  embeddingText: string;
  /** S3 Vectors メタデータ (~0.5KB) */
  metadata: {
    // Filterable (クエリフィルタリング用)
    category: string;
    pub_date: string;
    // Non-filterable (検索結果の即時表示 + DynamoDB ルックアップ用)
    article_id: string;
    title: string;
    url: string;
  };
}

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

/**
 * Embedding 用のテキストを生成
 *
 * タイトルを先頭に配置して重み付け (Embedding モデルは先頭テキストを重視)。
 * gemini-embedding-001 の最大入力は 2048 トークン (~8000 文字) のため切り捨て。
 */
function createEmbeddingText(title: string, content: string): string {
  const cleanTitle = stripHtml(title);
  const cleanContent = stripHtml(content);
  return `${cleanTitle}\n\n${cleanContent}`.slice(0, 8000);
}

/**
 * DynamoDB レコードを S3 Vectors 投入用に前処理
 *
 * DynamoDB Streams の INSERT/MODIFY イベントから呼び出される。
 * url_hash は DynamoDB PK としてすでに確定しているため再計算不要。
 */
export function processArticleForVectors(
  record: DynamoDBArticleRecord
): ProcessedArticle {
  const pubDate = record.pubDate
    ? record.pubDate.split('T')[0]
    : new Date().toISOString().split('T')[0];

  return {
    vectorKey: record.url_hash,
    embeddingText: createEmbeddingText(record.title, record.content),
    metadata: {
      category: record.category || 'unknown',
      pub_date: pubDate,
      article_id: record.url_hash,
      title: stripHtml(record.title),
      url: record.url,
    },
  };
}
