import { Redis } from '@upstash/redis';

/**
 * Upstash Redis クライアントの初期化
 *
 * 環境変数が設定されていない場合は null を返し、
 * フォールバックとしてインメモリキャッシュが使用される。
 *
 * 環境変数:
 *   UPSTASH_REDIS_REST_URL: Upstash REST API の URL
 *   UPSTASH_REDIS_REST_TOKEN: Upstash REST API のトークン
 */
const getRedisClient = (): Redis | null => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn(
      '[Redis] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is not set. ' +
        'Falling back to in-memory cache.',
    );
    return null;
  }

  return new Redis({ url, token });
};

export const redis = getRedisClient();
