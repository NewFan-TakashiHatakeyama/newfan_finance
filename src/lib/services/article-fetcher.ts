import { cache } from 'react';
import { createHash } from 'crypto';
import { cacheGet, cacheSet } from '@/lib/cache/cache-service';
import { articleDetailKey } from '@/lib/cache/cache-keys';

/**
 * SSR ページ用の記事データ型
 *
 * Server Component の generateMetadata() と page() の両方で使用する。
 * HTML コンテンツとプレーンテキスト (meta description 用) の両方を保持。
 */
export interface ArticleData {
  title: string;
  content: string;
  plainTextContent: string;
  url: string;
  thumbnail: string;
  pubDate: string;
  author: string;
  category: string;
}

/**
 * 記事詳細を取得する統合関数
 *
 * React.cache() でリクエスト単位のメモ化を行い、
 * generateMetadata() と page() の 2 箇所で呼ばれても
 * 実際のデータ取得は 1 回のみに抑える。
 *
 * キャッシュ戦略:
 *   Layer 0: React.cache() - リクエスト内メモ化
 *   Layer 1: Upstash Redis + インメモリ (TTL: 600 秒)
 *   Layer 2: DynamoDB or S3 (DATA_SOURCE 環境変数で切替)
 */
export const getArticleById = cache(
  async (encodedId: string): Promise<ArticleData | null> => {
    const decodedUrl = decodeArticleId(encodedId);
    if (!decodedUrl) return null;

    // Layer 1: Redis / インメモリキャッシュ
    const cacheKey = articleDetailKey(decodedUrl);
    try {
      const cached = await cacheGet<ArticleData>(cacheKey);
      if (cached) {
        return cached;
      }
    } catch {
      // キャッシュエラーは無視してデータソースにフォールバック
    }

    // Layer 2: データソースから取得
    const dataSource = process.env.DATA_SOURCE || 's3';
    let article: ArticleData | null = null;

    if (dataSource === 'dynamodb') {
      article = await fetchFromDynamoDB(decodedUrl);
    } else {
      article = await fetchFromS3(decodedUrl);
    }

    // キャッシュに保存
    if (article) {
      try {
        await cacheSet(cacheKey, article, { ttl: 600 });
      } catch {
        // キャッシュ保存エラーは無視
      }
    }

    return article;
  },
);

/**
 * Base64 エンコードされた記事 ID をデコード
 */
function decodeArticleId(encodedId: string): string | null {
  try {
    let id = decodeURIComponent(encodedId);
    // Base64 パディング補完
    while (id.length % 4 !== 0) {
      id += '=';
    }
    return Buffer.from(id, 'base64').toString('utf-8');
  } catch {
    return null;
  }
}

/**
 * DynamoDB から記事を取得 (現行メインデータソース)
 *
 * getArticleByUrl() で URL ハッシュベースの O(1) 取得。
 * DynamoDB エラー時は S3 にフォールバック。
 */
async function fetchFromDynamoDB(
  url: string,
): Promise<ArticleData | null> {
  try {
    const { getArticleByUrl } = await import('@/lib/aws/article-service');
    const record = await getArticleByUrl(url);
    if (!record) return null;

    return {
      title: record.title,
      content: record.content,
      plainTextContent: stripHtml(record.content).slice(0, 300),
      url: record.url,
      thumbnail: record.thumbnail || '',
      pubDate: record.pubDate,
      author: record.author,
      category: record.category,
    };
  } catch (error) {
    console.error('[ArticleFetcher] DynamoDB error, falling back to S3:', error);
    return fetchFromS3(url);
  }
}

/**
 * S3 から記事を取得 (フォールバック用)
 *
 * 7 日間分のディレクトリを走査して記事を検索する旧方式。
 * DynamoDB が利用不可の場合のフォールバックとして使用。
 */
async function fetchFromS3(url: string): Promise<ArticleData | null> {
  try {
    const { fetchArticleItemFromS3 } = await import(
      '@/lib/aws/article-item-fetcher'
    );

    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const item = await fetchArticleItemFromS3(url, dateStr);
      if (item) {
        return convertArticleItemToData(item);
      }
    }
  } catch (error) {
    console.error('[ArticleFetcher] S3 fetch error:', error);
  }

  return null;
}

/**
 * S3 ArticleItem → ArticleData への変換
 */
function convertArticleItemToData(item: {
  title: string;
  link: string;
  summary?: string;
  content_html?: string | null;
  published?: string;
  published_iso?: string;
  authors?: string[];
  category?: string;
}): ArticleData {
  const content = item.summary || item.content_html || '';
  const plainText = stripHtml(content);

  return {
    title: decodeHtmlEntities(item.title || ''),
    content,
    plainTextContent: plainText.slice(0, 300),
    url: item.link,
    thumbnail: extractThumbnail(content),
    pubDate: item.published_iso || item.published || '',
    author: item.authors?.[0] || 'PR Newswire',
    category: item.category || '',
  };
}

/**
 * HTML タグを除去してプレーンテキストに変換
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
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
 * HTML からサムネイル画像 URL を抽出
 */
function extractThumbnail(html: string): string {
  if (!html) return '';

  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch && !imgMatch[1].includes('/ad_placeholder')) {
    return imgMatch[1];
  }

  const urlMatch = html.match(
    /https?:\/\/[^\s<>"']+\.(jpg|jpeg|png|gif|webp)/i,
  );
  return urlMatch ? urlMatch[0] : '';
}
