import { createHash } from 'crypto';

/**
 * DynamoDB に格納する整形済み記事データ
 */
export interface ProcessedArticle {
  url_hash: string;
  title_hash: string;
  url: string;
  title: string;
  content: string;
  thumbnail: string;
  pubDate: string;
  pubDateEpoch: number;
  author: string;
  category: string;
  s3Key: string;
  createdAt: string;
  updatedAt: string;
  ttl: number;
}

/**
 * S3 に格納されている ArticleItem の形式
 */
export interface ArticleItem {
  source: string;
  category: string;
  title: string;
  link: string;
  id: string;
  published: string;
  published_iso: string;
  summary: string;
  content_html: string | null;
  authors: string[];
}

/**
 * 記事 URL から SHA-256 ハッシュを生成 (URL ベースの重複排除用)
 */
export function generateUrlHash(url: string): string {
  const normalized = url.trim().replace(/\/$/, '').split('?')[0];
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * 記事タイトルから SHA-256 ハッシュを生成 (コンテンツベースの重複排除用)
 *
 * タイトルを正規化してからハッシュ化する:
 * - 前後の空白を除去
 * - 全角スペースを半角に変換
 * - 連続する空白を 1 つに統合
 * - 小文字に変換
 */
export function generateTitleHash(title: string): string {
  const normalized = title
    .trim()
    .replace(/\u3000/g, ' ')     // 全角スペース → 半角
    .replace(/\s+/g, ' ')        // 連続空白を 1 つに
    .toLowerCase();
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * HTML からサムネイル画像 URL を抽出
 */
function extractThumbnail(html: string): string {
  if (!html) return '';

  // img タグの src 属性から画像 URL を抽出
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) {
    const url = imgMatch[1];
    // 広告プレースホルダは除外
    if (!url.includes('/ad_placeholder')) return url;
  }

  // URL パターンから画像 URL を抽出
  const urlMatch = html.match(
    /https?:\/\/[^\s<>"']+\.(jpg|jpeg|png|gif|webp)/i,
  );
  return urlMatch ? urlMatch[0] : '';
}

/**
 * HTML エンティティをデコード (簡易版)
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * ArticleItem を DynamoDB 用の ProcessedArticle に変換
 *
 * @param item - S3 から取得した ArticleItem
 * @param s3Key - 元の S3 オブジェクトキー
 * @returns DynamoDB に格納する ProcessedArticle
 */
export function processArticle(
  item: ArticleItem,
  s3Key: string,
): ProcessedArticle {
  const now = new Date().toISOString();
  const pubDate = item.published_iso || item.published || now;
  const pubDateEpoch = Math.floor(new Date(pubDate).getTime() / 1000);

  // TTL: 30 日後に自動削除
  const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

  const decodedTitle = decodeHtmlEntities(item.title);

  return {
    url_hash: generateUrlHash(item.link),
    title_hash: generateTitleHash(decodedTitle),
    url: item.link,
    title: decodedTitle,
    content: item.summary || item.content_html || '',
    thumbnail: extractThumbnail(item.summary || ''),
    pubDate,
    pubDateEpoch,
    author: item.authors?.[0] || 'PR Newswire',
    category: item.category,
    s3Key,
    createdAt: now,
    updatedAt: now,
    ttl,
  };
}
