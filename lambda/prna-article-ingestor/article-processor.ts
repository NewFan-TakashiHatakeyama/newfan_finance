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
 * DynamoDB の 1 項目あたり上限は 400KB。他属性 (url/title/thumbnail 等) で約 1KB 使うため、
 * content は安全マージンを取って 380KB (UTF-8 バイト) までに制限する。
 *
 * ※ 超過記事はごく少数 (実測 0.04%) だが、制限しないと PutItem が
 *   ValidationException となり記事ごと取り込めない (従来は握り潰されて静かに欠落していた)。
 *   RAG は content の先頭 8,000 字しか Embedding に使わないため、切り詰めても検索品質に影響しない。
 */
const MAX_CONTENT_BYTES = 380 * 1024;

/**
 * UTF-8 バイト数で文字列を切り詰める (マルチバイト文字の途中で切らない)
 */
function truncateToBytes(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, 'utf8');
  if (buf.length <= maxBytes) return text;
  // 末尾がマルチバイト文字の途中だと不正な置換文字になるため除去する
  return buf.subarray(0, maxBytes).toString('utf8').replace(/�+$/, '');
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

  // TTL は設定しない (廃止)。
  // 以前は「取り込み時刻 + 30日」で自動削除していたが、RAG の回答品質は記事の網羅性に
  // 依存するため、30日で消す設計が品質の上限を決めてしまっていた。
  // 記事の raw は S3 (prna/items/) に永続保管されており、DynamoDB 側の保持容量も小さいため、
  // テーブルの TTL 設定ごと無効化している (S3 Vectors 索引との不整合も構造的に起きにくくなる)。

  const decodedTitle = decodeHtmlEntities(item.title);

  return {
    url_hash: generateUrlHash(item.link),
    title_hash: generateTitleHash(decodedTitle),
    url: item.link,
    title: decodedTitle,
    content: truncateToBytes(item.summary || item.content_html || '', MAX_CONTENT_BYTES),
    thumbnail: extractThumbnail(item.summary || ''),
    pubDate,
    pubDateEpoch,
    author: item.authors?.[0] || 'PR Newswire',
    category: item.category,
    s3Key,
    createdAt: now,
    updatedAt: now,
  };
}
