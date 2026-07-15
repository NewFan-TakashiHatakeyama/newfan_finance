/**
 * S3 Vectors 幽霊ベクトル棚卸しスクリプト (対策B)
 *
 * DynamoDB (prna-articles) は TTL 30日で記事を自動削除するが、S3 Vectors 側の
 * ベクトルは削除されないため、「記事本体が存在しないベクトル (幽霊エントリ)」が
 * 索引に蓄積する。本スクリプトは索引を棚卸しし、幽霊ベクトルを削除する。
 *
 * 恒久対応は lambda/prna-vectors-ingestor が REMOVE イベントに連動して
 * DeleteVectors を呼ぶこと (対策A)。本スクリプトは対策A 導入前に蓄積した分の
 * 一度きりの清掃と、以降の定期的な健全性チェックに使う。
 *
 * 処理:
 *   1. ListVectors で索引の全キーを列挙
 *   2. DynamoDB へ BatchGetItem (100件ずつ) で実在チェック
 *   3. 実在しないキーを DeleteVectors で削除 (--apply 指定時のみ)
 *
 * 使い方:
 *   npx tsx scripts/cleanup-orphan-vectors.ts           # ドライラン (既定・削除しない)
 *   npx tsx scripts/cleanup-orphan-vectors.ts --apply   # 実削除
 *
 * ⚠️ --apply は本番データ (S3 Vectors) を削除する。必ず先にドライランで
 *    削除対象件数を確認すること。
 */
import 'dotenv/config';

import {
  S3VectorsClient,
  ListVectorsCommand,
  DeleteVectorsCommand,
} from '@aws-sdk/client-s3vectors';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchGetCommand } from '@aws-sdk/lib-dynamodb';

const REGION = process.env.AWS_REGION || 'ap-northeast-1';
const VECTOR_BUCKET = process.env.S3_VECTORS_BUCKET || 'newfan-finance-vectors';
const VECTOR_INDEX = process.env.S3_VECTORS_INDEX || 'prna-articles';
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'prna-articles';

/** DeleteVectors の上限 */
const DELETE_BATCH = 500;
/** BatchGetItem の上限 */
const GET_BATCH = 100;

const s3v = new S3VectorsClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

/** 索引の全ベクトルキーを列挙 */
async function listAllVectorKeys(): Promise<string[]> {
  const keys: string[] = [];
  let nextToken: string | undefined;

  do {
    const res = await s3v.send(
      new ListVectorsCommand({
        vectorBucketName: VECTOR_BUCKET,
        indexName: VECTOR_INDEX,
        maxResults: 500,
        nextToken,
      })
    );
    for (const v of res.vectors ?? []) {
      if (v.key) keys.push(v.key);
    }
    nextToken = res.nextToken;
    process.stdout.write(`\r[List] ${keys.length} keys...`);
  } while (nextToken);

  process.stdout.write('\n');
  return keys;
}

/** DynamoDB に実在するキーの集合を返す */
async function findLiveKeys(keys: string[]): Promise<Set<string>> {
  const live = new Set<string>();

  for (let i = 0; i < keys.length; i += GET_BATCH) {
    const batch = keys.slice(i, i + GET_BATCH);

    let requestItems: Record<string, any> | undefined = {
      [TABLE_NAME]: {
        Keys: batch.map((url_hash) => ({ url_hash })),
        ProjectionExpression: 'url_hash',
      },
    };

    // UnprocessedKeys があれば消化するまで繰り返す
    while (requestItems && Object.keys(requestItems).length > 0) {
      const res = await ddb.send(new BatchGetCommand({ RequestItems: requestItems }));
      for (const item of res.Responses?.[TABLE_NAME] ?? []) {
        live.add(item.url_hash as string);
      }
      const unprocessed = res.UnprocessedKeys;
      requestItems =
        unprocessed && Object.keys(unprocessed).length > 0 ? unprocessed : undefined;
    }

    process.stdout.write(
      `\r[Check] ${Math.min(i + GET_BATCH, keys.length)}/${keys.length} — live ${live.size}`
    );
  }

  process.stdout.write('\n');
  return live;
}

/** 幽霊ベクトルを削除 */
async function deleteGhosts(ghosts: string[]): Promise<number> {
  let deleted = 0;

  for (let i = 0; i < ghosts.length; i += DELETE_BATCH) {
    const batch = ghosts.slice(i, i + DELETE_BATCH);
    await s3v.send(
      new DeleteVectorsCommand({
        vectorBucketName: VECTOR_BUCKET,
        indexName: VECTOR_INDEX,
        keys: batch,
      })
    );
    deleted += batch.length;
    process.stdout.write(`\r[Delete] ${deleted}/${ghosts.length}`);
  }

  process.stdout.write('\n');
  return deleted;
}

async function main() {
  const apply = process.argv.includes('--apply');

  console.log('=== S3 Vectors 幽霊ベクトル棚卸し ===');
  console.log(`索引 : ${VECTOR_BUCKET}/${VECTOR_INDEX}`);
  console.log(`記事 : ${TABLE_NAME} (${REGION})`);
  console.log(`モード: ${apply ? '⚠️  APPLY (実削除)' : 'DRY-RUN (削除しない)'}\n`);

  const keys = await listAllVectorKeys();
  if (keys.length === 0) {
    console.log('索引にベクトルがありません。終了します。');
    return;
  }

  const live = await findLiveKeys(keys);
  const ghosts = keys.filter((k) => !live.has(k));
  const rate = ((live.size / keys.length) * 100).toFixed(1);

  console.log('\n--- 棚卸し結果 ---');
  console.log(`索引ベクトル総数 : ${keys.length}`);
  console.log(`実在 (LIVE)      : ${live.size}`);
  console.log(`幽霊 (GHOST)     : ${ghosts.length}`);
  console.log(`実在率           : ${rate}%`);

  if (ghosts.length === 0) {
    console.log('\n✅ 幽霊ベクトルはありません。索引は健全です。');
    return;
  }

  console.log('\n削除対象の例 (先頭5件):');
  for (const k of ghosts.slice(0, 5)) console.log(`  - ${k}`);

  if (!apply) {
    console.log(
      `\n[DRY-RUN] ${ghosts.length} 件が削除対象です。実削除するには --apply を付けて再実行してください。`
    );
    return;
  }

  console.log(`\n[APPLY] ${ghosts.length} 件を削除します...`);
  const deleted = await deleteGhosts(ghosts);
  console.log(`\n✅ 削除完了: ${deleted} 件`);
  console.log(`索引の実在率は 100% になりました (残 ${live.size} 件)。`);
}

main().catch((err) => {
  console.error('\n❌ 失敗:', err);
  process.exit(1);
});
