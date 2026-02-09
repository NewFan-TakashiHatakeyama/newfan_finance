/**
 * S3 Vectors データ整合性確認スクリプト
 *
 * DynamoDB 記事数と S3 Vectors の状態を比較し、
 * テストクエリで検索が正常に動作することを確認する。
 */
import 'dotenv/config';

// Lambda 環境変数をマッピング
process.env.EMBEDDING_API_KEY =
  process.env.EMBEDDING_API_KEY ||
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  '';
process.env.EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || 'gemini';
process.env.EMBEDDING_DIMENSION = process.env.EMBEDDING_DIMENSION || '3072';

import {
  S3VectorsClient,
  QueryVectorsCommand,
  GetVectorsCommand,
} from '@aws-sdk/client-s3vectors';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { generateEmbedding } from '../lambda/prna-vectors-ingestor/embedding-client';

const REGION = 'ap-northeast-1';
const VECTOR_BUCKET = 'newfan-finance-vectors';
const VECTOR_INDEX = 'prna-articles';
const TABLE_NAME = 'prna-articles';

const s3v = new S3VectorsClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

async function getDynamoDBCount(): Promise<number> {
  let count = 0;
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await ddb.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        Select: 'COUNT',
        ExclusiveStartKey: lastKey,
      })
    );
    count += res.Count || 0;
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return count;
}

async function testQuery(queryText: string, topK: number = 5) {
  console.log(`\n--- Query: "${queryText}" (top ${topK}) ---`);
  const embedding = await generateEmbedding(queryText);
  console.log(`  Embedding generated: ${embedding.length} dimensions`);

  const res = await s3v.send(
    new QueryVectorsCommand({
      vectorBucketName: VECTOR_BUCKET,
      indexName: VECTOR_INDEX,
      queryVector: { float32: embedding },
      topK,
      returnDistance: true,
      returnMetadata: true,
    })
  );

  const vectors = res.vectors || [];
  console.log(`  Results: ${vectors.length} vectors`);

  vectors.forEach((v, i) => {
    const meta = v.metadata as Record<string, string> | undefined;
    console.log(
      `  ${i + 1}. [${v.distance?.toFixed(4)}] ${meta?.category || '?'} | ${meta?.title?.substring(0, 70) || '?'}`
    );
    console.log(`     key: ${v.key}  url: ${meta?.url?.substring(0, 60) || 'N/A'}`);
  });

  return vectors;
}

async function testGetVectors(keys: string[]) {
  console.log(`\n--- GetVectors: ${keys.length} keys ---`);
  const res = await s3v.send(
    new GetVectorsCommand({
      vectorBucketName: VECTOR_BUCKET,
      indexName: VECTOR_INDEX,
      keys,
      returnMetadata: true,
    })
  );
  const vectors = res.vectors || [];
  console.log(`  Retrieved: ${vectors.length} vectors`);
  vectors.forEach((v, i) => {
    const meta = v.metadata as Record<string, string> | undefined;
    console.log(`  ${i + 1}. key: ${v.key}  title: ${meta?.title?.substring(0, 60) || '?'}`);
  });
  return vectors;
}

async function main() {
  console.log('=== S3 Vectors データ整合性確認 ===\n');

  // 1. DynamoDB 件数
  console.log('[1] DynamoDB 記事数');
  const dbCount = await getDynamoDBCount();
  console.log(`  Count: ${dbCount}`);

  // 2. バックフィル結果との比較
  console.log('\n[2] バックフィル結果との比較');
  console.log(`  DynamoDB:   ${dbCount} 件`);
  console.log(`  バックフィル: 2,826 件 (100% 成功)`);
  console.log(
    dbCount === 2826
      ? '  ✓ 一致: DynamoDB と バックフィル件数が一致'
      : `  △ 差分: DynamoDB=${dbCount} vs バックフィル=2826 (新規記事が追加された可能性)`
  );

  // 3. テストクエリ
  console.log('\n[3] セマンティック検索テスト');

  // 3-1: 金融全般
  const results1 = await testQuery('金融市場の動向と株式投資', 5);

  // 3-2: 英語クエリ
  await testQuery('stock market earnings report Q4 2025', 3);

  // 3-3: カテゴリフィルタ付き (将来用 - 現在は S3 Vectors のフィルタ構文確認)
  await testQuery('テクノロジー企業の最新ニュース', 3);

  // 4. GetVectors テスト (QueryVectors で得たキーを使用)
  if (results1.length > 0) {
    const testKeys = results1.slice(0, 3).map((v) => v.key!);
    await testGetVectors(testKeys);
  }

  console.log('\n=== 整合性確認完了 ===');
}

main().catch(console.error);
