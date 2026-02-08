import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { ProcessedArticle } from './article-processor';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-northeast-1',
});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'prna-articles';

/**
 * title_hash GSI を使って、同じタイトルの記事が既に存在するかチェック
 *
 * @param titleHash - 記事タイトルの SHA-256 ハッシュ
 * @returns 重複が存在する場合は true
 */
async function isDuplicate(titleHash: string): Promise<boolean> {
  const command = new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'title_hash-index',
    KeyConditionExpression: 'title_hash = :th',
    ExpressionAttributeValues: {
      ':th': titleHash,
    },
    Limit: 1,
    Select: 'COUNT',
  });

  const response = await docClient.send(command);
  return (response.Count ?? 0) > 0;
}

/**
 * 記事データを DynamoDB に書き込み (重複チェック付き)
 *
 * 1. title_hash GSI で同一タイトルの記事が存在するかチェック
 * 2. 重複がなければ PutItem で書き込み
 * 3. 重複があればスキップ
 *
 * @param article - 整形済み記事データ
 * @returns "inserted" | "skipped_duplicate"
 */
export async function upsertArticle(
  article: ProcessedArticle,
): Promise<'inserted' | 'skipped_duplicate'> {
  // 重複チェック: 同じタイトルの記事が既に存在するか
  const duplicate = await isDuplicate(article.title_hash);
  if (duplicate) {
    return 'skipped_duplicate';
  }

  const command = new PutCommand({
    TableName: TABLE_NAME,
    Item: article,
    // url_hash が同じ場合は上書きを許可 (同一 URL の更新)
    // title_hash が異なる新規記事のみこの行に到達する
  });

  await docClient.send(command);
  return 'inserted';
}
