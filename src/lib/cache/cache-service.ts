import { redis } from './redis-client';

/**
 * フォールバック用のインメモリキャッシュ
 * Redis が利用不可の場合に使用
 */
const memoryCache = new Map<string, { data: string; timestamp: number }>();
const MEMORY_CACHE_MAX_SIZE = 100;

interface CacheOptions {
  /** TTL (秒) */
  ttl?: number;
}

const DEFAULT_TTL = 300; // 5 分

/**
 * キャッシュからデータを取得
 *
 * Redis → インメモリ の順でフォールバック
 *
 * @param key - キャッシュキー
 * @returns キャッシュされたデータ (ミスの場合は null)
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  // Layer 2: Redis
  if (redis) {
    try {
      const data = await redis.get<T>(key);
      if (data !== null && data !== undefined) {
        console.log(`[Cache] Redis HIT: ${key}`);
        return data;
      }
      console.log(`[Cache] Redis MISS: ${key}`);
    } catch (error) {
      console.error(`[Cache] Redis GET error for ${key}:`, error);
      // Redis エラー時はインメモリにフォールバック
    }
  }

  // フォールバック: インメモリ
  const memEntry = memoryCache.get(key);
  if (memEntry) {
    const now = Date.now();
    if (now - memEntry.timestamp < DEFAULT_TTL * 1000) {
      console.log(`[Cache] Memory HIT: ${key}`);
      return JSON.parse(memEntry.data) as T;
    }
    memoryCache.delete(key);
  }

  console.log(`[Cache] MISS (all layers): ${key}`);
  return null;
}

/**
 * キャッシュにデータを保存
 *
 * Redis とインメモリの両方に保存する。
 * Redis が利用不可の場合はインメモリのみに保存。
 *
 * @param key - キャッシュキー
 * @param data - 保存するデータ
 * @param options - TTL 等のオプション
 */
export async function cacheSet<T>(
  key: string,
  data: T,
  options: CacheOptions = {},
): Promise<void> {
  const ttl = options.ttl || DEFAULT_TTL;
  const serialized = JSON.stringify(data);

  // Layer 2: Redis
  if (redis) {
    try {
      await redis.set(key, data, { ex: ttl });
      console.log(`[Cache] Redis SET: ${key} (TTL: ${ttl}s)`);
    } catch (error) {
      console.error(`[Cache] Redis SET error for ${key}:`, error);
    }
  }

  // フォールバック: インメモリにも保存
  if (memoryCache.size >= MEMORY_CACHE_MAX_SIZE) {
    // LRU 的に最も古いエントリを削除
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey) memoryCache.delete(oldestKey);
  }

  memoryCache.set(key, {
    data: serialized,
    timestamp: Date.now(),
  });
}

/**
 * 特定のキャッシュを無効化
 *
 * @param key - 無効化するキャッシュキー
 */
export async function cacheInvalidate(key: string): Promise<void> {
  if (redis) {
    try {
      await redis.del(key);
      console.log(`[Cache] Redis DEL: ${key}`);
    } catch (error) {
      console.error(`[Cache] Redis DEL error for ${key}:`, error);
    }
  }
  memoryCache.delete(key);
}

/**
 * パターンに一致するキャッシュを一括無効化
 *
 * 例: invalidatePattern('discover:*') で全 Discover キャッシュを削除
 *
 * @param pattern - Redis SCAN のパターン (e.g., "discover:*")
 */
export async function cacheInvalidatePattern(pattern: string): Promise<void> {
  if (redis) {
    try {
      let cursor = 0;
      do {
        const result = await redis.scan(cursor, {
          match: pattern,
          count: 100,
        });
        const nextCursor: number = Number(result[0]);
        const keys: string[] = result[1];
        cursor = nextCursor;
        if (keys.length > 0) {
          await redis.del(...keys);
          console.log(
            `[Cache] Redis DEL pattern ${pattern}: ${keys.length} keys`,
          );
        }
      } while (cursor !== 0);
    } catch (error) {
      console.error(
        `[Cache] Redis pattern DEL error for ${pattern}:`,
        error,
      );
    }
  }

  // インメモリも削除
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  for (const key of memoryCache.keys()) {
    if (regex.test(key)) {
      memoryCache.delete(key);
    }
  }
}

/**
 * キャッシュの統計情報を取得 (モニタリング用)
 *
 * @returns Redis とインメモリキャッシュの統計情報
 */
export async function cacheStats(): Promise<{
  redis: { connected: boolean; keyCount?: number };
  memory: { size: number; maxSize: number };
}> {
  let redisConnected = false;
  let redisKeyCount: number | undefined;

  if (redis) {
    try {
      const dbSize = await redis.dbsize();
      redisConnected = true;
      redisKeyCount = dbSize;
    } catch {
      redisConnected = false;
    }
  }

  return {
    redis: { connected: redisConnected, keyCount: redisKeyCount },
    memory: { size: memoryCache.size, maxSize: MEMORY_CACHE_MAX_SIZE },
  };
}
