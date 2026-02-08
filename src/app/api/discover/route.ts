import { NextRequest } from 'next/server';
import { ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '@/lib/aws/s3-client';
import { withRetry } from '@/lib/aws/s3-retry';
import { handleS3Error } from '@/lib/aws/s3-error-handler';
import { ArticleItem } from '@/lib/aws/article-item-fetcher';
import { cacheGet, cacheSet } from '@/lib/cache/cache-service';
import { discoverListKey } from '@/lib/cache/cache-keys';
import {
  getArticlesByTopic,
  getArticlesByTopics,
  ArticleRecord,
} from '@/lib/aws/article-service';

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || '';
const ITEMS_PREFIX = 'prna/items';

/**
 * データソース切り替え: "dynamodb" | "s3" (デフォルト: "s3")
 * 移行期間中は環境変数で制御し、DynamoDB 安定後に "dynamodb" に切り替える
 */
const DATA_SOURCE = process.env.DATA_SOURCE || 's3';

if (!BUCKET_NAME && DATA_SOURCE === 's3') {
  console.warn(
    '[Discover API] AWS_S3_BUCKET_NAME is not set. S3 operations will fail.',
  );
}

const TOPICS = [
  'capital',
  'english',
  'finance',
  'market',
  'prnewswire',
  'real_estate',
  'special',
];

/** 日付形式: YYYY-MM-DD */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * HTMLからサムネイル画像を抽出する関数
 */
function extractThumbnail(html: string): string {
  if (!html) return '';
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) {
    return imgMatch[1];
  }
  const urlMatch = html.match(
    /https?:\/\/[^\s<>"']+\.(jpg|jpeg|png|gif|webp)/i,
  );
  return urlMatch ? urlMatch[0] : '';
}

// ===================================================================
// DynamoDB からの記事取得 (移行後のデータソース)
// ===================================================================

/**
 * DynamoDB から記事一覧を取得
 */
async function fetchArticlesFromDynamoDB(
  topic?: string,
): Promise<DiscoverArticle[]> {
  console.log(
    `[DynamoDB] Fetching articles for topic: ${topic || 'all'}`,
  );

  let articles: ArticleRecord[];

  if (topic && topic !== 'all') {
    articles = await getArticlesByTopic(topic, 50);
  } else {
    articles = await getArticlesByTopics(TOPICS, 50);
  }

  console.log(`[DynamoDB] Fetched ${articles.length} articles`);

  return articles.map((article) => ({
    title: article.title,
    content: article.content,
    url: article.url,
    thumbnail: article.thumbnail || '',
    pubDate: article.pubDate,
    author: article.author,
    category: article.category,
  }));
}

// ===================================================================
// S3 からの記事取得 (既存のデータソース)
// ===================================================================

/**
 * S3 から items ディレクトリの記事 JSON ファイルを取得
 * 直近 1 日のデータを取得し、重複を除去
 */
async function fetchArticlesFromS3(
  topic?: string,
): Promise<DiscoverArticle[]> {
  if (!BUCKET_NAME) {
    throw new Error('AWS_S3_BUCKET_NAME environment variable is not set');
  }

  const today = new Date();
  const dateToFetch = formatDate(today);

  console.log(
    `[S3] Fetching articles from items for date: ${dateToFetch}`,
  );

  const allArticles: ArticleItem[] = [];
  const topicsToFetch = topic ? [topic] : TOPICS;

  for (const topicKey of topicsToFetch) {
    const prefix = `${ITEMS_PREFIX}/${dateToFetch}/${topicKey}/`;

    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        MaxKeys: 1000,
      });

      const listResponse = await withRetry(async () => {
        return await s3Client.send(listCommand);
      });

      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        console.log(`No files found in ${prefix}`);
        continue;
      }

      console.log(
        `Found ${listResponse.Contents.length} files in ${prefix}`,
      );

      for (const object of listResponse.Contents) {
        if (!object.Key || !object.Key.endsWith('.json')) {
          continue;
        }

        try {
          const getCommand = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: object.Key,
          });

          const getResponse = await withRetry(async () => {
            return await s3Client.send(getCommand);
          });

          const jsonContent = await getResponse.Body?.transformToString();
          if (!jsonContent) continue;

          const articleItem: ArticleItem = JSON.parse(jsonContent);
          allArticles.push(articleItem);
        } catch (error) {
          console.error(`Error processing ${object.Key}:`, error);
          continue;
        }
      }
    } catch (error: unknown) {
      const err = error as { name?: string };
      if (err.name === 'AccessDenied') {
        console.error(
          `Access denied for prefix ${prefix} - IAM policy may need to be updated`,
        );
      } else {
        console.error(
          `Error fetching articles from ${prefix}:`,
          error,
        );
      }
      continue;
    }
  }

  console.log(`[S3] Total articles fetched: ${allArticles.length}`);

  if (allArticles.length === 0) {
    console.warn('No articles found in items directory. Check:');
    console.warn('1. IAM policy has access to prna/items/*');
    console.warn(
      '2. Data exists in prna/items/{date}/{topic}/ directories',
    );
    console.warn('3. Date format matches YYYY-MM-DD');
  }

  // 重複を除去（URL で判定）
  const uniqueArticles = new Map<string, ArticleItem>();
  for (const article of allArticles) {
    const normalizedUrl =
      article.link?.trim().replace(/\/$/, '').split('?')[0] || '';
    if (normalizedUrl && !uniqueArticles.has(normalizedUrl)) {
      uniqueArticles.set(normalizedUrl, article);
    }
  }

  console.log(
    `[S3] Unique articles after deduplication: ${uniqueArticles.size}`,
  );

  // Discover 形式に変換
  const discoverArticles: DiscoverArticle[] = Array.from(
    uniqueArticles.values(),
  )
    .map((articleItem) => {
      let thumbnail = extractThumbnail(articleItem.summary || '');

      if (
        !thumbnail ||
        thumbnail.trim() === '' ||
        thumbnail.includes('/ad_placeholder')
      ) {
        thumbnail = '';
      }

      return {
        title: articleItem.title,
        content: articleItem.summary || articleItem.content_html || '',
        url: articleItem.link,
        thumbnail,
        pubDate: articleItem.published,
        author: articleItem.authors?.[0] || 'PR Newswire',
        category: articleItem.category,
      };
    })
    .filter((article) => article !== null);

  // 日付でソート（新しい順）
  discoverArticles.sort((a, b) => {
    const dateA = new Date(a.pubDate).getTime();
    const dateB = new Date(b.pubDate).getTime();
    return dateB - dateA;
  });

  return discoverArticles;
}

// ===================================================================
// 統合データ取得 (Redis キャッシュ + データソース切り替え)
// ===================================================================

/** Discover API レスポンスの記事型 */
interface DiscoverArticle {
  title: string;
  content: string;
  url: string;
  thumbnail: string;
  pubDate: string;
  author: string;
  category: string;
}

/**
 * 記事一覧を取得 (Redis キャッシュ + S3/DynamoDB フォールバック)
 *
 * 1. Redis キャッシュをチェック
 * 2. キャッシュミスの場合、DATA_SOURCE に応じてデータソースから取得
 * 3. 取得結果を Redis にキャッシュ
 */
async function fetchArticles(
  topic?: string,
): Promise<DiscoverArticle[]> {
  // ① キャッシュチェック (Redis + インメモリ)
  const cacheKey = discoverListKey(topic || 'all');
  const cached = await cacheGet<DiscoverArticle[]>(cacheKey);
  if (cached) {
    console.log(
      `[Cache] Returning cached data for topic: ${topic || 'all'}`,
    );
    return cached;
  }

  // ② キャッシュミス → データソースから取得
  let articles: DiscoverArticle[];

  if (DATA_SOURCE === 'dynamodb') {
    articles = await fetchArticlesFromDynamoDB(topic);
  } else {
    articles = await fetchArticlesFromS3(topic);
  }

  // ③ キャッシュに保存 (TTL: 5 分)
  if (articles.length > 0) {
    await cacheSet(cacheKey, articles, { ttl: 300 });
  }

  return articles;
}

// ===================================================================
// API Route Handler
// ===================================================================

export const GET = async (req: NextRequest) => {
  console.log(
    `[API] /api/discover route called (DATA_SOURCE: ${DATA_SOURCE})`,
  );
  try {
    const { searchParams } = new URL(req.url);
    const topic = searchParams.get('topic') || 'finance';
    console.log(`[API] Request topic: ${topic}`);

    // トピックのバリデーション
    if (topic && !TOPICS.includes(topic)) {
      return Response.json(
        { message: 'Invalid topic' },
        { status: 400 },
      );
    }

    // 記事を取得 (キャッシュ + データソース)
    console.log(
      `[API] Fetching articles for topic: ${topic}`,
    );
    const blogs = await fetchArticles(topic || undefined);
    console.log(`[API] Fetched ${blogs.length} articles`);

    // トピックでフィルタリング（指定されている場合、かつ全トピックから取得した場合）
    let filteredBlogs = blogs;
    if (topic && topic !== 'all') {
      filteredBlogs = blogs.filter(
        (blog: DiscoverArticle) => blog.category === topic,
      );
      console.log(
        `[API] Filtered to ${filteredBlogs.length} articles for topic ${topic}`,
      );
    }

    console.log(`[API] Returning ${filteredBlogs.length} articles`);
    return Response.json(
      { blogs: filteredBlogs },
      {
        status: 200,
        headers: {
          'Cache-Control':
            'public, s-maxage=300, stale-while-revalidate=600',
        },
      },
    );
  } catch (err) {
    const { message, statusCode } = handleS3Error(err);
    console.error(`An error occurred in discover route: ${err}`);
    return Response.json(
      { message: message || 'An error has occurred' },
      { status: statusCode || 500 },
    );
  }
};
