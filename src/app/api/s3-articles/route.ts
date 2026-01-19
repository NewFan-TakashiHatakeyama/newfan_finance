import { NextRequest, NextResponse } from 'next/server';
import { ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '@/lib/aws/s3-client';
import { parseRSS } from '@/lib/aws/rss-parser';
import { convertRSSItemToArticle, ArticleMetadata } from '@/lib/aws/article-converter';
import { withRetry } from '@/lib/aws/s3-retry';
import { handleS3Error } from '@/lib/aws/s3-error-handler';

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME!;
const BASE_PREFIX = process.env.AWS_S3_PREFIX || '';

const TOPICS = ['capital', 'english', 'finance', 'market', 'prnewswire', 'real_estate', 'special'];

// 日付形式: YYYY-MM-DD
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// トピックと日付からプレフィックスを生成
function getTopicPrefix(topic: string, date?: string): string {
  const dateStr = date || formatDate(new Date());
  if (BASE_PREFIX) {
    // BASE_PREFIXの末尾にスラッシュがない場合は追加
    const prefix = BASE_PREFIX.endsWith('/') ? BASE_PREFIX : `${BASE_PREFIX}/`;
    return `${prefix}${topic}/${dateStr}/`;
  }
  return `${topic}/${dateStr}/`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const topic = searchParams.get('topic') || 'all';
    const date = searchParams.get('date'); // YYYY-MM-DD形式
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let articles: ArticleMetadata[] = [];

    if (topic === 'all') {
      // 全トピックから取得
      const allArticles = await Promise.all(
        TOPICS.map((t) => fetchArticlesByTopic(t, date, limit + offset))
      );
      articles = allArticles.flat();
      // 日付でソート（新しい順）
      articles.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
      // オフセットとリミットを適用
      articles = articles.slice(offset, offset + limit);
    } else {
      articles = await fetchArticlesByTopic(topic, date, limit + offset);
      articles = articles.slice(offset, offset + limit);
    }

    return NextResponse.json(
      {
        articles,
        total: articles.length,
        hasMore: articles.length === limit,
      },
      { status: 200 }
    );
  } catch (error) {
    const { message, statusCode } = handleS3Error(error);
    console.error('Error fetching articles from S3:', error);
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}

async function fetchArticlesByTopic(
  topic: string,
  date?: string,
  maxKeys: number = 1000
): Promise<ArticleMetadata[]> {
  const prefix = getTopicPrefix(topic, date);

  const listCommand = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: prefix,
    MaxKeys: maxKeys,
  });

  const listResponse = await withRetry(async () => {
    return await s3Client.send(listCommand);
  });

  if (!listResponse.Contents || listResponse.Contents.length === 0) {
    return [];
  }

  // 各XMLファイルから記事を取得
  const allArticles: ArticleMetadata[] = [];

  for (const object of listResponse.Contents) {
    if (!object.Key || !object.Key.endsWith('.xml')) {
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

      const xmlContent = await getResponse.Body?.transformToString();
      if (!xmlContent) continue;

      // RSSをパース
      const parsedRSS = parseRSS(xmlContent);

      // 各アイテムを記事データに変換
      for (const item of parsedRSS.items) {
        const article = convertRSSItemToArticle(item, object.Key);
        allArticles.push(article);
      }
    } catch (error) {
      console.error(`Error processing ${object.Key}:`, error);
      // エラーが発生しても他のファイルの処理を続行
      continue;
    }
  }

  return allArticles;
}
