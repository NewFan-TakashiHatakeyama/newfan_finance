/**
 * 取り込みログ管理
 *
 * S3 バケット上にログを記録し、どのデータを取り込んだかを追跡可能にする。
 *
 * ログパス: s3://newfan-finance/prna/vectors-log/{date}/{batchId}.json
 *
 * 各ログには以下を記録:
 *   - バッチ ID (一意識別子)
 *   - 実行タイプ (event: イベント駆動 / backfill: 一括移行)
 *   - ソース (dynamodb-stream / backfill)
 *   - 処理結果 (success/error/skipped) と詳細
 *   - 処理時間
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'ap-northeast-1',
});
const LOG_BUCKET = 'newfan-finance';
const LOG_PREFIX = 'prna/vectors-log';

export interface IngestionStatus {
  /** DynamoDB url_hash (PK) */
  urlHash: string;
  /** S3 Vectors に書き込んだキー (= url_hash) */
  vectorKey?: string;
  /** DynamoDB Stream イベント名 (INSERT / MODIFY) */
  eventName?: string;
  status: 'success' | 'error' | 'skipped';
  reason?: string;
  title?: string;
  category?: string;
  url?: string;
  timestamp: string;
  durationMs: number;
}

interface IngestionLogEntry {
  batchId: string;
  executionType: 'event' | 'backfill';
  source: 'dynamodb-stream' | 'backfill';
  startTime: string;
  endTime: string;
  totalRecords: number;
  succeeded: number;
  failed: number;
  skipped: number;
  records: IngestionStatus[];
}

/**
 * 取り込みログを S3 に書き込み
 */
export async function logIngestion(
  results: IngestionStatus[],
  executionType: 'event' | 'backfill' = 'event'
): Promise<void> {
  if (results.length === 0) return;

  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const batchId = `${timestamp}-${Math.random().toString(36).slice(2, 8)}`;

  const logEntry: IngestionLogEntry = {
    batchId,
    executionType,
    source: executionType === 'event' ? 'dynamodb-stream' : 'backfill',
    startTime: results[0].timestamp,
    endTime: now.toISOString(),
    totalRecords: results.length,
    succeeded: results.filter((r) => r.status === 'success').length,
    failed: results.filter((r) => r.status === 'error').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    records: results,
  };

  const logKey = `${LOG_PREFIX}/${date}/${batchId}.json`;

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: LOG_BUCKET,
        Key: logKey,
        Body: JSON.stringify(logEntry, null, 2),
        ContentType: 'application/json',
      })
    );
    console.log(`[IngestionLog] Written to s3://${LOG_BUCKET}/${logKey}`);
  } catch (error) {
    // ログ書き込み失敗は致命的ではないため、エラーを握りつぶす
    console.error('[IngestionLog] Failed to write log:', error);
  }
}
