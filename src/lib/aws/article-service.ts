import { QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoClient } from './dynamodb-client';
import { createHash } from 'crypto';

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'prna-articles';

/**
 * DynamoDB から取得する記事レコードの型定義
 */
export interface ArticleRecord {
  url_hash: string;
  url: string;
  title: string;
  content: string;
  thumbnail: string;
  pubDate: string;
  pubDateEpoch: number;
  author: string;
  category: string;
}

/**
 * トピック別に記事一覧を取得 (DynamoDB Query)
 *
 * GSI `category-pubDateEpoch-index` を使用し、
 * 指定トピックの記事を新しい順に取得する。
 *
 * @param topic - カテゴリ名 (e.g., "finance", "market")
 * @param limit - 取得件数の上限 (デフォルト: 50)
 * @returns 記事レコードの配列
 */
export async function getArticlesByTopic(
  topic: string,
  limit: number = 50,
): Promise<ArticleRecord[]> {
  const command = new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'category-pubDateEpoch-index',
    KeyConditionExpression: 'category = :cat',
    ExpressionAttributeValues: {
      ':cat': topic,
    },
    ScanIndexForward: false, // 降順 (新しい順)
    Limit: limit,
  });

  const response = await dynamoClient.send(command);
  return (response.Items || []) as ArticleRecord[];
}

/**
 * 複数トピックの記事を一括取得
 *
 * @param topics - カテゴリ名の配列
 * @param limitPerTopic - トピックごとの取得件数上限 (デフォルト: 50)
 * @returns 記事レコードの配列 (新しい順にソート済み)
 */
export async function getArticlesByTopics(
  topics: string[],
  limitPerTopic: number = 50,
): Promise<ArticleRecord[]> {
  const promises = topics.map((topic) =>
    getArticlesByTopic(topic, limitPerTopic),
  );
  const results = await Promise.all(promises);

  // 全トピックの結果をフラットにして新しい順にソート
  const allArticles = results.flat();
  allArticles.sort((a, b) => b.pubDateEpoch - a.pubDateEpoch);

  // 重複排除 (url_hash ベース)
  const seen = new Set<string>();
  return allArticles.filter((article) => {
    if (seen.has(article.url_hash)) return false;
    seen.add(article.url_hash);
    return true;
  });
}

/**
 * URL ハッシュで記事詳細を取得 (DynamoDB GetItem)
 *
 * @param urlHash - 記事 URL の SHA-256 ハッシュ
 * @returns 記事レコード (見つからない場合は null)
 */
export async function getArticleByUrlHash(
  urlHash: string,
): Promise<ArticleRecord | null> {
  const command = new GetCommand({
    TableName: TABLE_NAME,
    Key: { url_hash: urlHash },
  });

  const response = await dynamoClient.send(command);
  return (response.Item as ArticleRecord) || null;
}

/**
 * URL から記事を検索 (URL → ハッシュ → GetItem)
 *
 * URL を正規化してハッシュを生成し、DynamoDB から取得する。
 * S3 全走査を行う既存方式と比較して O(1) で取得可能。
 *
 * @param url - 記事の元 URL
 * @returns 記事レコード (見つからない場合は null)
 */
export async function getArticleByUrl(
  url: string,
): Promise<ArticleRecord | null> {
  const normalized = url.trim().replace(/\/$/, '').split('?')[0];
  const urlHash = createHash('sha256').update(normalized).digest('hex');
  return getArticleByUrlHash(urlHash);
}
