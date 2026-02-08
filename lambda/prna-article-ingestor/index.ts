import { S3Event, S3EventRecord } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { processArticle, ArticleItem } from './article-processor';
import { upsertArticle } from './dynamodb-writer';
import { invalidateCacheForTopic } from './cache-invalidator';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-northeast-1',
});

/**
 * Lambda ハンドラー: S3 イベント通知を受信し、記事を DynamoDB に書き込む
 *
 * @param event - S3 Event Notification から渡されるイベントオブジェクト
 */
export const handler = async (event: S3Event): Promise<void> => {
  console.log(`Processing ${event.Records.length} S3 event(s)`);

  const processedCategories = new Set<string>();

  for (const record of event.Records) {
    const category = await processRecord(record);
    if (category) {
      processedCategories.add(category);
    }
  }

  // 処理したカテゴリのキャッシュを一括無効化
  for (const category of processedCategories) {
    await invalidateCacheForTopic(category);
  }

  console.log(
    `Completed processing. Categories updated: ${Array.from(processedCategories).join(', ') || 'none'}`,
  );
};

/**
 * 個別の S3 イベントレコードを処理
 *
 * @param record - S3 イベントレコード
 * @returns 処理した記事のカテゴリ (スキップした場合は null)
 */
async function processRecord(
  record: S3EventRecord,
): Promise<string | null> {
  const bucket = record.s3.bucket.name;
  const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

  // JSON ファイルのみ処理
  if (!key.endsWith('.json')) {
    console.log(`Skipping non-JSON file: ${key}`);
    return null;
  }

  // prna/items/ 配下のみ処理
  if (!key.startsWith('prna/items/')) {
    console.log(`Skipping file outside prna/items/: ${key}`);
    return null;
  }

  console.log(`Processing: s3://${bucket}/${key}`);

  try {
    // S3 から JSON を取得
    const response = await s3Client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );

    const jsonContent = await response.Body?.transformToString();
    if (!jsonContent) {
      console.warn(`Empty content for ${key}`);
      return null;
    }

    // JSON パース
    const articleItem: ArticleItem = JSON.parse(jsonContent);

    // 記事データを整形
    const processedArticle = processArticle(articleItem, key);

    // DynamoDB に書き込み (重複チェック付き)
    const result = await upsertArticle(processedArticle);

    if (result === 'skipped_duplicate') {
      console.log(`Skipped duplicate: ${processedArticle.title}`);
      return null;
    }

    console.log(`Successfully processed: ${processedArticle.title}`);
    return processedArticle.category;
  } catch (error) {
    console.error(`Error processing ${key}:`, error);
    // 個別の記事エラーでは Lambda 全体を失敗させない
    // Dead Letter Queue (DLQ) が設定されていれば、リトライ後に DLQ に送信される
    return null;
  }
}
