import { createHash } from 'crypto';

/**
 * Discover 記事一覧のキャッシュキーを生成
 *
 * @param topic - トピック名 (e.g., "finance", "all")
 * @param date - 日付文字列 (YYYY-MM-DD)。省略時は今日の日付
 * @returns キャッシュキー (e.g., "discover:finance:2026-02-09")
 */
export function discoverListKey(topic: string, date?: string): string {
  const dateStr = date || new Date().toISOString().split('T')[0];
  return `discover:${topic}:${dateStr}`;
}

/**
 * 記事詳細のキャッシュキーを生成
 *
 * URL を正規化し、SHA-256 ハッシュの先頭 16 文字をキーに使用する。
 *
 * @param url - 記事の URL
 * @returns キャッシュキー (e.g., "article:a1b2c3d4e5f6g7h8")
 */
export function articleDetailKey(url: string): string {
  const normalized = url.trim().replace(/\/$/, '').split('?')[0];
  const hash = createHash('sha256')
    .update(normalized)
    .digest('hex')
    .slice(0, 16);
  return `article:${hash}`;
}

/**
 * キャッシュメタデータのキー
 * 最終更新タイムスタンプの記録に使用
 */
export const META_LAST_UPDATED = 'discover:meta:last_updated';
