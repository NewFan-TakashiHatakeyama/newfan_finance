import { NextRequest, NextResponse } from 'next/server';
import { fetchArticleItemFromS3 } from '@/lib/aws/article-item-fetcher';
import { getArticleByUrl, ArticleRecord } from '@/lib/aws/article-service';
import { handleS3Error } from '@/lib/aws/s3-error-handler';
import { cacheGet, cacheSet } from '@/lib/cache/cache-service';
import { articleDetailKey } from '@/lib/cache/cache-keys';

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || '';

/**
 * データソース切り替え: "dynamodb" | "s3" (デフォルト: "s3")
 * 移行期間中は環境変数で制御し、DynamoDB 安定後に "dynamodb" に切り替える
 */
const DATA_SOURCE = process.env.DATA_SOURCE || 's3';

if (!BUCKET_NAME && DATA_SOURCE === 's3') {
  console.warn(
    '[Discover Article API] AWS_S3_BUCKET_NAME is not set. S3 operations will fail.',
  );
}

/** 記事詳細レスポンスの型 */
interface ArticleDetail {
  title: string;
  content: string;
  url: string;
  thumbnail: string;
  pubDate: string;
  author: string;
  category: string;
}

/**
 * HTMLコンテンツからサムネイル画像URLを抽出
 */
function extractThumbnailFromHtml(html: string): string {
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) {
    return imgMatch[1];
  }

  const urlMatch = html.match(
    /https?:\/\/[^\s<>"']+\.(jpg|jpeg|png|gif|webp)/i,
  );
  if (urlMatch) {
    return urlMatch[0];
  }

  return '';
}

/**
 * DynamoDB から記事詳細を取得
 */
async function fetchArticleFromDynamoDB(
  decodedUrl: string,
): Promise<ArticleDetail | null> {
  console.log(`[DynamoDB] Fetching article by URL: ${decodedUrl}`);

  const article: ArticleRecord | null = await getArticleByUrl(decodedUrl);

  if (!article) {
    console.log('[DynamoDB] Article not found');
    return null;
  }

  console.log(`[DynamoDB] Article found: ${article.title}`);
  return {
    title: article.title,
    content: article.content,
    url: article.url,
    thumbnail: article.thumbnail || '',
    pubDate: article.pubDate,
    author: article.author,
    category: article.category,
  };
}

/**
 * S3 から記事詳細を取得 (既存ロジック)
 */
async function fetchArticleFromS3(
  decodedUrl: string,
): Promise<ArticleDetail | null> {
  console.log(`[S3] Fetching article by URL: ${decodedUrl}`);

  // 今日の日付と過去数日分を試す（記事が古い場合に備えて）
  const datesToTry: string[] = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    datesToTry.push(date.toISOString().split('T')[0]);
  }

  for (const date of datesToTry) {
    try {
      console.log(`[S3] Trying to fetch article for date: ${date}`);
      const articleItem = await fetchArticleItemFromS3(decodedUrl, date);
      if (articleItem) {
        console.log(`[S3] Article found for date: ${date}`);
        return {
          title: articleItem.title,
          content: articleItem.summary || articleItem.content_html || '',
          url: articleItem.link,
          thumbnail: extractThumbnailFromHtml(articleItem.summary || ''),
          pubDate: articleItem.published,
          author: articleItem.authors?.[0] || 'PR Newswire',
          category: articleItem.category,
        };
      }
    } catch (error: unknown) {
      const err = error as { name?: string };
      console.error(
        `[S3] Error fetching article for date ${date}:`,
        error,
      );
      if (err.name === 'AccessDenied') {
        console.error(
          '[S3] Access denied - IAM policy may need to be updated for prna/items/',
        );
      }
      continue;
    }
  }

  console.log('[S3] Article not found in any date range');
  return null;
}

/**
 * 記事詳細ページ用のAPIエンドポイント
 *
 * Redis キャッシュ → DATA_SOURCE (DynamoDB or S3) の順で記事を取得する。
 * DynamoDB 使用時は O(1) で取得可能。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  console.log(
    `[API] /api/discover/article/[id] route called (DATA_SOURCE: ${DATA_SOURCE})`,
  );

  try {
    const resolvedParams = await params;
    let articleId = resolvedParams.id;

    // もし params から取得できない場合、URL から直接抽出
    if (!articleId) {
      const url = new URL(request.url);
      const pathParts = url.pathname.split('/');
      const idIndex = pathParts.indexOf('article') + 1;
      if (idIndex > 0 && idIndex < pathParts.length) {
        articleId = pathParts[idIndex];
      }
    }

    if (!articleId) {
      return NextResponse.json(
        { error: 'Article ID is required' },
        { status: 400 },
      );
    }

    // URL エンコードされた文字をデコード
    try {
      articleId = decodeURIComponent(articleId);
    } catch {
      // デコードに失敗した場合は元の文字列を使用
    }

    // Base64 エンコードされた URL をデコード
    let decodedUrl: string;
    try {
      let base64String = articleId;
      while (base64String.length % 4 !== 0) {
        base64String += '=';
      }
      decodedUrl = Buffer.from(base64String, 'base64').toString('utf-8');
    } catch {
      return NextResponse.json(
        { error: 'Invalid article ID format' },
        { status: 400 },
      );
    }

    // ① キャッシュチェック (Redis + インメモリ)
    const cacheKey = articleDetailKey(decodedUrl);
    const cached = await cacheGet<ArticleDetail>(cacheKey);
    if (cached) {
      console.log(`[Cache] Returning cached article: ${cached.title}`);
      return NextResponse.json(
        { article: cached },
        { status: 200 },
      );
    }

    // ② キャッシュミス → データソースから取得
    let article: ArticleDetail | null;

    if (DATA_SOURCE === 'dynamodb') {
      article = await fetchArticleFromDynamoDB(decodedUrl);
    } else {
      article = await fetchArticleFromS3(decodedUrl);
    }

    if (!article) {
      return NextResponse.json(
        { error: 'Article not found' },
        { status: 404 },
      );
    }

    // ③ キャッシュに保存 (TTL: 10 分)
    await cacheSet(cacheKey, article, { ttl: 600 });

    return NextResponse.json(
      { article },
      { status: 200 },
    );
  } catch (error) {
    const { message, statusCode } = handleS3Error(error);
    console.error('Error fetching article:', error);
    return NextResponse.json(
      { error: message || 'An error occurred' },
      { status: statusCode || 500 },
    );
  }
}
