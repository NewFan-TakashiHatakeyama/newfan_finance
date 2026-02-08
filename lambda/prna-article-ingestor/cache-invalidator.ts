import { Redis } from '@upstash/redis';

/**
 * Upstash Redis を用いたキャッシュ無効化
 *
 * Lambda 関数が新しい記事を DynamoDB に書き込んだ際に、
 * 該当トピックのキャッシュを自動的に無効化する。
 */

let redis: Redis | null = null;

/**
 * Redis クライアントを遅延初期化
 */
function getRedis(): Redis | null {
  if (redis) return redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn(
      '[Cache] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is not set. ' +
        'Cache invalidation will be skipped.',
    );
    return null;
  }

  redis = new Redis({ url, token });
  return redis;
}

/**
 * 指定トピックのキャッシュを無効化
 *
 * @param category - 記事のカテゴリ (e.g., "finance", "market")
 */
export async function invalidateCacheForTopic(
  category: string,
): Promise<void> {
  const redisClient = getRedis();
  if (!redisClient) return;

  const today = new Date().toISOString().split('T')[0];
  const keys = [`discover:${category}:${today}`, `discover:all:${today}`];

  try {
    await redisClient.del(...keys);
    console.log(`[Cache] Invalidated keys: ${keys.join(', ')}`);
  } catch (error) {
    console.error('[Cache] Invalidation error:', error);
    // キャッシュ無効化失敗は致命的ではないため、エラーを握りつぶす
  }
}
