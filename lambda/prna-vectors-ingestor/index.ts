/**
 * prna-vectors-ingestor — Lambda エントリポイント
 *
 * DynamoDB Streams イベントで起動し、DynamoDB に格納された記事データから
 * Embedding を生成して S3 Vectors に格納する。
 *
 * トリガー: DynamoDB Streams (prna-articles テーブル)
 *
 * フロー:
 *   1. DynamoDB Streams から INSERT/MODIFY イベントを受信
 *   2. NewImage から記事データを取得 (unmarshall)
 *   3. テキスト前処理 (HTML 除去、正規化)
 *   4. Gemini gemini-embedding-001 で Embedding 生成 (3072 次元)
 *   5. S3 Vectors (newfan-finance-vectors/prna-articles) に PutVectors
 *   6. 取り込みログを S3 に書き込み
 *
 * ※ S3 バケットにはカテゴリを跨いだ重複記事が存在するため、
 *   DynamoDB (url_hash で重複排除済み) を起点とすることで
 *   同一記事の二重 Embedding を防止する。
 */

import { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { AttributeValue } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBArticleRecord,
  processArticleForVectors,
} from './text-processor';
import { generateEmbedding } from './embedding-client';
import { putVector } from './s3-vectors-client';
import { logIngestion, IngestionStatus } from './ingestion-logger';

export const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
  console.log(
    `[Ingestor] Processing ${event.Records.length} DynamoDB Stream event(s)`
  );

  const results: IngestionStatus[] = [];

  for (const record of event.Records) {
    const result = await processRecord(record);
    results.push(result);
  }

  // 取り込みログを S3 に書き込み
  await logIngestion(results);

  const succeeded = results.filter((r) => r.status === 'success').length;
  const failed = results.filter((r) => r.status === 'error').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;

  console.log(
    `[Ingestor] Completed: ${succeeded} succeeded, ${failed} failed, ${skipped} skipped`
  );
};

/**
 * 個別の DynamoDB Stream レコードを処理
 *
 * INSERT (新規記事) と MODIFY (更新) のみ処理し、
 * REMOVE (削除/TTL 失効) はスキップする。
 * エラーは個別にキャッチし、バッチ全体を失敗させない。
 */
async function processRecord(
  record: DynamoDBRecord
): Promise<IngestionStatus> {
  const eventName = record.eventName || 'UNKNOWN';
  const urlHash =
    record.dynamodb?.Keys?.url_hash?.S || 'unknown';
  const startTime = Date.now();

  // INSERT / MODIFY のみ処理 (REMOVE はスキップ)
  if (eventName !== 'INSERT' && eventName !== 'MODIFY') {
    return {
      urlHash,
      eventName,
      status: 'skipped',
      reason: `Event type ${eventName} is not a target`,
      timestamp: new Date().toISOString(),
      durationMs: 0,
    };
  }

  // NewImage が存在しない場合はスキップ
  if (!record.dynamodb?.NewImage) {
    return {
      urlHash,
      eventName,
      status: 'skipped',
      reason: 'No NewImage in stream record',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };
  }

  try {
    // ① DynamoDB Streams レコードを unmarshall
    const article = unmarshall(
      record.dynamodb.NewImage as Record<string, AttributeValue>
    ) as DynamoDBArticleRecord;

    // URL が無い記事はスキップ
    if (!article.url) {
      return {
        urlHash,
        eventName,
        status: 'skipped',
        reason: 'No url field in article',
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startTime,
      };
    }

    // ② テキスト前処理
    const processed = processArticleForVectors(article);

    // Embedding テキストが空の場合はスキップ
    if (!processed.embeddingText || processed.embeddingText.trim().length === 0) {
      return {
        urlHash,
        eventName,
        status: 'skipped',
        reason: 'Empty embedding text',
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startTime,
      };
    }

    // ③ Embedding 生成
    const embedding = await generateEmbedding(processed.embeddingText);

    // ④ S3 Vectors に書き込み (upsert)
    await putVector({
      key: processed.vectorKey,
      embedding,
      metadata: processed.metadata,
    });

    console.log(
      `[Ingestor] OK [${eventName}]: ${processed.metadata.title.slice(0, 60)}... (${Date.now() - startTime}ms)`
    );

    return {
      urlHash,
      vectorKey: processed.vectorKey,
      eventName,
      status: 'success',
      title: processed.metadata.title,
      category: processed.metadata.category,
      url: processed.metadata.url,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[Ingestor] Error processing ${urlHash} [${eventName}]:`,
      message
    );
    return {
      urlHash,
      eventName,
      status: 'error',
      reason: message,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };
  }
}
