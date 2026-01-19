import { NextRequest } from 'next/server';
import { ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '@/lib/aws/s3-client';
import { withRetry } from '@/lib/aws/s3-retry';
import { handleS3Error } from '@/lib/aws/s3-error-handler';
import { ArticleItem } from '@/lib/aws/article-item-fetcher';

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME!;
const ITEMS_PREFIX = 'prna/items';

const TOPICS = ['capital', 'english', 'finance', 'market', 'prnewswire', 'real_estate', 'special'];

// 日付形式: YYYY-MM-DD
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// メモリキャッシュ（サーバーサイド）
interface CacheEntry {
  data: any[];
  timestamp: number;
  topic?: string;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5分間キャッシュ

/**
 * キャッシュキーを生成
 */
function getCacheKey(topic?: string): string {
  const today = formatDate(new Date());
  return `discover:${topic || 'all'}:${today}`;
}

/**
 * キャッシュからデータを取得
 */
function getFromCache(cacheKey: string): any[] | null {
  const entry = cache.get(cacheKey);
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.timestamp > CACHE_TTL) {
    cache.delete(cacheKey);
    return null;
  }

  return entry.data;
}

/**
 * キャッシュにデータを保存
 */
function setCache(cacheKey: string, data: any[]): void {
  cache.set(cacheKey, {
    data,
    timestamp: Date.now(),
  });
}

/**
 * S3からitemsディレクトリの記事JSONファイルを取得
 * 直近1日のデータを取得し、重複を除去
 */
async function fetchArticlesFromItems(topic?: string): Promise<any[]> {
  if (!BUCKET_NAME) {
    throw new Error('AWS_S3_BUCKET_NAME environment variable is not set');
  }

  // キャッシュをチェック
  const cacheKey = getCacheKey(topic);
  const cachedData = getFromCache(cacheKey);
  if (cachedData) {
    console.log(`[Cache] Returning cached data for topic: ${topic || 'all'}`);
    return cachedData;
  }

  // 今日の日付のみを取得
  const today = new Date();
  const dateToFetch = formatDate(today);

  console.log(`Fetching articles from items for date: ${dateToFetch}`);

  const allArticles: ArticleItem[] = [];
  const topicsToFetch = topic ? [topic] : TOPICS;

  // 今日の日付の各トピックから記事を取得
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

      console.log(`Found ${listResponse.Contents.length} files in ${prefix}`);

      // 各JSONファイルを読み込む
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
    } catch (error: any) {
      // エラーが発生しても次のトピックを試す
      if (error.name === 'AccessDenied') {
        console.error(`Access denied for prefix ${prefix} - IAM policy may need to be updated`);
      } else {
        console.error(`Error fetching articles from ${prefix}:`, error);
      }
      continue;
    }
  }

  console.log(`Total articles fetched: ${allArticles.length}`);

  if (allArticles.length === 0) {
    console.warn('No articles found in items directory. Check:');
    console.warn('1. IAM policy has access to prna/items/*');
    console.warn('2. Data exists in prna/items/{date}/{topic}/ directories');
    console.warn('3. Date format matches YYYY-MM-DD');
  }

  // 重複を除去（URLで判定）
  const uniqueArticles = new Map<string, ArticleItem>();
  for (const article of allArticles) {
    const normalizedUrl = article.link?.trim().replace(/\/$/, '').split('?')[0] || '';
    if (normalizedUrl && !uniqueArticles.has(normalizedUrl)) {
      uniqueArticles.set(normalizedUrl, article);
    } else if (normalizedUrl) {
      console.log(`Duplicate article found: ${normalizedUrl}`);
    }
  }

  console.log(`Unique articles after deduplication: ${uniqueArticles.size}`);

  // HTMLからサムネイル画像を抽出する関数
  const extractThumbnail = (html: string): string => {
    if (!html) return '';
    const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch) {
      return imgMatch[1];
    }
    const urlMatch = html.match(/https?:\/\/[^\s<>"']+\.(jpg|jpeg|png|gif|webp)/i);
    return urlMatch ? urlMatch[0] : '';
  };

  // Discover形式に変換
  const discoverArticles = Array.from(uniqueArticles.values())
    .map((articleItem) => {
      let thumbnail = extractThumbnail(articleItem.summary || '');
      
      // thumbnailがない場合、空文字列を設定（画像を表示しない）
      if (!thumbnail || thumbnail.trim() === '' || thumbnail.includes('/ad_placeholder')) {
        thumbnail = ''; // 画像が存在しない場合は空文字列
      }

      return {
        title: articleItem.title,
        content: articleItem.summary || articleItem.content_html || '', // HTMLコンテンツを保持
        url: articleItem.link,
        thumbnail: thumbnail,
        pubDate: articleItem.published,
        author: articleItem.authors?.[0] || 'PR Newswire',
        category: articleItem.category, // トピックフィルタリング用に追加
      };
    })
    .filter((article) => article !== null);

  console.log(`Articles with thumbnails: ${discoverArticles.length}`);

  // 日付でソート（新しい順）
  discoverArticles.sort((a, b) => {
    const dateA = new Date(a.pubDate).getTime();
    const dateB = new Date(b.pubDate).getTime();
    return dateB - dateA;
  });

  // キャッシュに保存
  setCache(cacheKey, discoverArticles);

  return discoverArticles;
}

export const GET = async (req: NextRequest) => {
  console.log('[API] /api/discover route called');
  try {
    const { searchParams } = new URL(req.url);
    const topic = searchParams.get('topic') || 'finance';
    console.log(`[API] Request topic: ${topic}`);

    // デバッグ: 環境変数の確認
    console.log('[API] Environment variables check:');
    console.log('[API] AWS_REGION:', process.env.AWS_REGION);
    console.log('[API] AWS_S3_BUCKET_NAME:', process.env.AWS_S3_BUCKET_NAME);
    console.log('[API] AWS_ACCESS_KEY_ID exists:', !!process.env.AWS_ACCESS_KEY_ID);
    console.log('[API] AWS_SECRET_ACCESS_KEY exists:', !!process.env.AWS_SECRET_ACCESS_KEY);

    // トピックのバリデーション
    if (topic && !TOPICS.includes(topic)) {
      return Response.json(
        { message: 'Invalid topic' },
        {
          status: 400,
        },
      );
    }

    // itemsから記事を取得（直近1日、重複除去済み、キャッシュ付き）
    // topicが指定されている場合は、そのトピックのみ取得
    console.log(`[API] Fetching articles from items for topic: ${topic}`);
    const blogs = await fetchArticlesFromItems(topic || undefined);
    console.log(`[API] Fetched ${blogs.length} articles from items`);

    // トピックでフィルタリング（指定されている場合、かつ全トピックから取得した場合）
    let filteredBlogs = blogs;
    if (topic && topic !== 'all') {
      // categoryフィールドでフィルタリング
      filteredBlogs = blogs.filter((blog: any) => blog.category === topic);
      console.log(`[API] Filtered to ${filteredBlogs.length} articles for topic ${topic}`);
    }

    console.log(`[API] Returning ${filteredBlogs.length} articles`);
    return Response.json(
      {
        blogs: filteredBlogs,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600', // 5分間キャッシュ、10分間は stale-while-revalidate
        },
      },
    );
  } catch (err) {
    const { message, statusCode } = handleS3Error(err);
    console.error(`An error occurred in discover route: ${err}`);
    return Response.json(
      {
        message: message || 'An error has occurred',
      },
      {
        status: statusCode || 500,
      },
    );
  }
};
