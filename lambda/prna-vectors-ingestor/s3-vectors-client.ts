/**
 * S3 Vectors 操作クライアント
 *
 * newfan-finance-vectors バケットの prna-articles インデックスに対して
 * ベクトルの追加 (PutVectors) を行う。
 *
 * 環境変数:
 *   S3_VECTORS_BUCKET — バケット名 (デフォルト: newfan-finance-vectors)
 *   S3_VECTORS_INDEX  — インデックス名 (デフォルト: prna-articles)
 *   AWS_REGION        — リージョン (デフォルト: ap-northeast-1)
 */

import {
  S3VectorsClient,
  PutVectorsCommand,
} from '@aws-sdk/client-s3vectors';

const VECTOR_BUCKET =
  process.env.S3_VECTORS_BUCKET || 'newfan-finance-vectors';
const VECTOR_INDEX = process.env.S3_VECTORS_INDEX || 'prna-articles';
const REGION = process.env.AWS_REGION || 'ap-northeast-1';

const client = new S3VectorsClient({ region: REGION });

export interface VectorInput {
  key: string;
  embedding: number[];
  metadata: Record<string, string>;
}

/**
 * S3 Vectors にベクトルを 1 件追加 (upsert)
 */
export async function putVector(input: VectorInput): Promise<void> {
  const command = new PutVectorsCommand({
    vectorBucketName: VECTOR_BUCKET,
    indexName: VECTOR_INDEX,
    vectors: [
      {
        key: input.key,
        data: { float32: input.embedding },
        metadata: input.metadata,
      },
    ],
  });

  await client.send(command);
}

/**
 * S3 Vectors にベクトルをバッチ追加 (最大 500 件/リクエスト)
 *
 * @returns 投入成功件数
 */
export async function putVectorsBatch(inputs: VectorInput[]): Promise<number> {
  const BATCH_SIZE = 500;
  let totalInserted = 0;

  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const batch = inputs.slice(i, i + BATCH_SIZE);

    const command = new PutVectorsCommand({
      vectorBucketName: VECTOR_BUCKET,
      indexName: VECTOR_INDEX,
      vectors: batch.map((input) => ({
        key: input.key,
        data: { float32: input.embedding },
        metadata: input.metadata,
      })),
    });

    await client.send(command);
    totalInserted += batch.length;

    console.log(
      `[S3Vectors] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} vectors inserted`
    );
  }

  return totalInserted;
}
