/**
 * S3 Vectors バックフィルスクリプト
 *
 * DynamoDB (prna-articles) の全記事を Scan し、
 * Embedding を生成して S3 Vectors に一括投入する。
 *
 * DynamoDB を起点とすることで、S3 バケットの重複記事を回避し、
 * 重複排除済みのデータのみを処理する。
 *
 * 実行方法:
 *   npx tsx scripts/backfill-s3-vectors.ts
 *   npx tsx scripts/backfill-s3-vectors.ts --category finance
 *   npx tsx scripts/backfill-s3-vectors.ts --dry-run
 *
 * 環境変数 (.env から読み込み):
 *   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 *   GEMINI_API_KEY (= EMBEDDING_API_KEY)
 *   DYNAMODB_TABLE_NAME (default: prna-articles)
 */

import 'dotenv/config';

// Lambda 環境変数をマッピング (.env → Lambda 形式)
// ※ 静的 import より前に設定する必要があるため、dotenv 後に即時設定
process.env.EMBEDDING_API_KEY =
  process.env.EMBEDDING_API_KEY ||
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  '';
process.env.EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || 'gemini';
process.env.EMBEDDING_DIMENSION = process.env.EMBEDDING_DIMENSION || '3072';
process.env.S3_VECTORS_BUCKET =
  process.env.S3_VECTORS_BUCKET || 'newfan-finance-vectors';
process.env.S3_VECTORS_INDEX =
  process.env.S3_VECTORS_INDEX || 'prna-articles';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import type {
  DynamoDBArticleRecord,
} from '../lambda/prna-vectors-ingestor/text-processor';
import type {
  VectorInput,
} from '../lambda/prna-vectors-ingestor/s3-vectors-client';

// 動的インポート: env vars 設定後にモジュールを読み込む
// (静的 import だとモジュール初期化時に EMBEDDING_API_KEY が空になる)
async function loadLambdaModules() {
  const textProcessor = await import('../lambda/prna-vectors-ingestor/text-processor');
  const embeddingClient = await import('../lambda/prna-vectors-ingestor/embedding-client');
  const s3VectorsClient = await import('../lambda/prna-vectors-ingestor/s3-vectors-client');
  return {
    processArticleForVectors: textProcessor.processArticleForVectors,
    generateEmbedding: embeddingClient.generateEmbedding,
    putVectorsBatch: s3VectorsClient.putVectorsBatch,
  };
}

// ===== Configuration =====
const TABLE = process.env.DYNAMODB_TABLE_NAME || 'prna-articles';
const REGION = process.env.AWS_REGION || 'ap-northeast-1';
const EMBEDDING_BATCH_SIZE = 25; // 一度に Embedding 生成する記事数
const VECTORS_BATCH_SIZE = 100; // S3 Vectors PutVectors のバッチサイズ
const DELAY_BETWEEN_EMBEDDINGS_MS = 50; // Embedding API レート制限回避 (50ms = ~20 req/s)
const DELAY_BETWEEN_BATCHES_MS = 2000; // バッチ間の待機時間

// ===== CLI 引数解析 =====
const args = process.argv.slice(2);
const options = {
  category: undefined as string | undefined,
  dryRun: false,
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--category' && args[i + 1]) {
    options.category = args[++i];
  }
  if (args[i] === '--dry-run') {
    options.dryRun = true;
  }
}

// ===== Progress Tracking =====
interface BackfillStats {
  totalScanned: number;
  totalSuccess: number;
  totalError: number;
  totalSkipped: number;
  errors: Array<{ urlHash: string; error: string }>;
  startTime: number;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0
    ? `${minutes}m ${remainingSeconds}s`
    : `${remainingSeconds}s`;
}

function printProgress(stats: BackfillStats, total: number): void {
  const elapsed = Date.now() - stats.startTime;
  const processed = stats.totalSuccess + stats.totalError + stats.totalSkipped;
  const rate = processed > 0 ? (processed / elapsed) * 1000 : 0;
  const remaining = total - processed;
  const eta = rate > 0 ? remaining / rate : 0;

  process.stdout.write(
    `\r[Backfill] ${processed}/${total} ` +
      `(✓${stats.totalSuccess} ✗${stats.totalError} ⊘${stats.totalSkipped}) ` +
      `${rate.toFixed(1)}/s ` +
      `ETA: ${formatDuration(eta * 1000)}  `
  );
}

// ===== Main Backfill Function =====

async function backfill(): Promise<void> {
  console.log('='.repeat(60));
  console.log('S3 Vectors Backfill Script');
  console.log('  Source: DynamoDB (prna-articles) — 重複排除済み');
  console.log('  Target: S3 Vectors (newfan-finance-vectors/prna-articles)');
  console.log('='.repeat(60));
  console.log(`Table:      ${TABLE}`);
  console.log(`Region:     ${REGION}`);
  console.log(`Model:      gemini-embedding-001 (3072 dim)`);
  console.log(`Batch:      ${EMBEDDING_BATCH_SIZE} embeddings / ${VECTORS_BATCH_SIZE} vectors`);
  if (options.category) {
    console.log(`Category:   ${options.category}`);
  }
  if (options.dryRun) {
    console.log(`Mode:       DRY RUN (Embedding 生成・S3 Vectors 書き込みをスキップ)`);
  }
  console.log('='.repeat(60));

  // Embedding API Key の確認
  if (!process.env.EMBEDDING_API_KEY && !options.dryRun) {
    console.error(
      '[ERROR] EMBEDDING_API_KEY (or GEMINI_API_KEY) is not set in .env'
    );
    process.exit(1);
  }

  // Lambda モジュールを動的にロード (env vars 設定後)
  const { processArticleForVectors, generateEmbedding, putVectorsBatch } =
    await loadLambdaModules();

  const ddbClient = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: REGION })
  );

  // ① まず全件数を取得
  console.log('\n[Step 1] DynamoDB 記事件数を取得中...');
  const totalCount = await countArticles(ddbClient);
  console.log(`  Total articles: ${totalCount}`);

  // ② Scan して処理
  console.log('\n[Step 2] バックフィル開始...');
  const stats: BackfillStats = {
    totalScanned: 0,
    totalSuccess: 0,
    totalError: 0,
    totalSkipped: 0,
    errors: [],
    startTime: Date.now(),
  };

  let lastEvaluatedKey: Record<string, any> | undefined;
  let pendingVectors: VectorInput[] = [];

  do {
    // DynamoDB Scan (ページネーション)
    const scanParams: any = {
      TableName: TABLE,
      ExclusiveStartKey: lastEvaluatedKey,
    };

    if (options.category) {
      scanParams.FilterExpression = 'category = :cat';
      scanParams.ExpressionAttributeValues = { ':cat': options.category };
    }

    const scanResult = await ddbClient.send(new ScanCommand(scanParams));
    const items = (scanResult.Items || []) as DynamoDBArticleRecord[];
    stats.totalScanned += items.length;

    // 各記事を処理
    for (const item of items) {
      try {
        // テキスト前処理
        const processed = processArticleForVectors(item);

        if (
          !processed.embeddingText ||
          processed.embeddingText.trim().length === 0
        ) {
          stats.totalSkipped++;
          printProgress(stats, totalCount);
          continue;
        }

        if (options.dryRun) {
          stats.totalSuccess++;
          printProgress(stats, totalCount);
          continue;
        }

        // Embedding 生成
        const embedding = await generateEmbedding(processed.embeddingText);

        pendingVectors.push({
          key: processed.vectorKey,
          embedding,
          metadata: processed.metadata,
        });

        stats.totalSuccess++;

        // レート制限回避
        await sleep(DELAY_BETWEEN_EMBEDDINGS_MS);

        printProgress(stats, totalCount);
      } catch (error: any) {
        stats.totalError++;
        stats.errors.push({
          urlHash: item.url_hash,
          error: error.message || String(error),
        });

        // レート制限エラーの場合はバックオフ
        if (error.message?.includes('429') || error.message?.includes('RATE')) {
          console.log('\n[WARN] Rate limited. Waiting 60 seconds...');
          await sleep(60000);
        }

        printProgress(stats, totalCount);
      }

      // S3 Vectors にバッチ投入 (記事処理の try-catch とは独立)
      if (pendingVectors.length >= VECTORS_BATCH_SIZE && !options.dryRun) {
        await flushVectorsBatch(pendingVectors, putVectorsBatch, stats);
        pendingVectors = [];
      }
    }

    lastEvaluatedKey = scanResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  // 残りのベクトルを投入
  if (pendingVectors.length > 0 && !options.dryRun) {
    await flushVectorsBatch(pendingVectors, putVectorsBatch, stats);
    pendingVectors = [];
  }

  // ③ 結果表示
  const elapsed = Date.now() - stats.startTime;
  console.log('\n');
  console.log('='.repeat(60));
  console.log('Backfill Complete');
  console.log('='.repeat(60));
  console.log(`Scanned:    ${stats.totalScanned}`);
  console.log(`Success:    ${stats.totalSuccess}`);
  console.log(`Errors:     ${stats.totalError}`);
  console.log(`Skipped:    ${stats.totalSkipped}`);
  console.log(`Duration:   ${formatDuration(elapsed)}`);
  console.log(
    `Throughput: ${((stats.totalSuccess / elapsed) * 1000).toFixed(1)} articles/s`
  );

  if (stats.errors.length > 0) {
    console.log('\n--- Errors ---');
    for (const err of stats.errors.slice(0, 20)) {
      console.log(`  ${err.urlHash}: ${err.error.slice(0, 100)}`);
    }
    if (stats.errors.length > 20) {
      console.log(`  ... and ${stats.errors.length - 20} more`);
    }
  }

  console.log('='.repeat(60));
}

/**
 * DynamoDB 記事件数を取得
 */
async function countArticles(
  client: DynamoDBDocumentClient
): Promise<number> {
  let total = 0;
  let lastKey: Record<string, any> | undefined;

  do {
    const params: any = {
      TableName: TABLE,
      Select: 'COUNT',
      ExclusiveStartKey: lastKey,
    };

    if (options.category) {
      params.FilterExpression = 'category = :cat';
      params.ExpressionAttributeValues = { ':cat': options.category };
    }

    const result = await client.send(new ScanCommand(params));
    total += result.Count || 0;
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return total;
}

/**
 * S3 Vectors にバッチ書き込み (リトライ付き)
 * 記事処理の try-catch から独立して実行し、失敗しても他の記事に影響しない
 */
async function flushVectorsBatch(
  vectors: VectorInput[],
  putVectorsBatchFn: (inputs: VectorInput[]) => Promise<number>,
  stats: BackfillStats,
  maxRetries: number = 3
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await putVectorsBatchFn(vectors);
      await sleep(DELAY_BETWEEN_BATCHES_MS);
      return;
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      console.log(
        `\n[WARN] S3 Vectors batch put failed (attempt ${attempt}/${maxRetries}): ${errorMsg.slice(0, 150)}`
      );

      if (attempt < maxRetries) {
        const backoffMs = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
        console.log(`  Retrying in ${backoffMs / 1000}s...`);
        await sleep(backoffMs);
      } else {
        console.log(
          `  [ERROR] Failed to write ${vectors.length} vectors after ${maxRetries} attempts`
        );
        stats.totalError += vectors.length;
        stats.totalSuccess -= vectors.length; // 成功カウントを戻す
        for (const v of vectors) {
          stats.errors.push({
            urlHash: v.key,
            error: `S3 Vectors batch write failed: ${errorMsg.slice(0, 100)}`,
          });
        }
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ===== Execute =====
backfill().catch((error) => {
  console.error('\nFatal error during backfill:', error);
  process.exit(1);
});
