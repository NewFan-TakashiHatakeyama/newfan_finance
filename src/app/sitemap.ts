import { MetadataRoute } from 'next';

/**
 * 動的サイトマップの生成
 *
 * DynamoDB (現行) または S3 から記事一覧を取得し、
 * 各記事の URL をサイトマップに含める。
 *
 * アクセス: /sitemap.xml
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || 'https://newfan-finance.com';

  // 静的ページ
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${siteUrl}/discover`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.9,
    },
  ];

  // 動的ページ (記事一覧)
  const articlePages = await getArticleSitemapEntries(siteUrl);

  return [...staticPages, ...articlePages];
}

async function getArticleSitemapEntries(
  siteUrl: string,
): Promise<MetadataRoute.Sitemap> {
  const dataSource = process.env.DATA_SOURCE || 's3';

  try {
    if (dataSource === 'dynamodb') {
      return await getEntriesFromDynamoDB(siteUrl);
    }
    return await getEntriesFromS3(siteUrl);
  } catch (error) {
    console.error('[Sitemap] Error generating article entries:', error);
    return [];
  }
}

/**
 * DynamoDB から全カテゴリの記事を取得してサイトマップエントリを生成
 */
async function getEntriesFromDynamoDB(
  siteUrl: string,
): Promise<MetadataRoute.Sitemap> {
  const { getArticlesByTopic } = await import('@/lib/aws/article-service');
  const topics = [
    'capital',
    'english',
    'finance',
    'market',
    'prnewswire',
    'real_estate',
    'special',
  ];

  const entries: MetadataRoute.Sitemap = [];
  const seenUrls = new Set<string>();

  for (const topic of topics) {
    try {
      const articles = await getArticlesByTopic(topic, 100);

      for (const article of articles) {
        // URL 重複排除
        if (seenUrls.has(article.url)) continue;
        seenUrls.add(article.url);

        const encodedUrl = Buffer.from(article.url).toString('base64');

        entries.push({
          url: `${siteUrl}/discover/article/${encodedUrl}`,
          lastModified: new Date(article.pubDate),
          changeFrequency: 'weekly',
          priority: 0.7,
        });
      }
    } catch (error) {
      console.error(
        `[Sitemap] Error fetching ${topic} articles:`,
        error,
      );
      continue;
    }
  }

  return entries;
}

/**
 * S3 から直近の記事を取得してサイトマップエントリを生成
 * コスト最小化のため直近 3 日分に限定
 */
async function getEntriesFromS3(
  siteUrl: string,
): Promise<MetadataRoute.Sitemap> {
  const { ListObjectsV2Command, GetObjectCommand } = await import(
    '@aws-sdk/client-s3'
  );
  const { s3Client } = await import('@/lib/aws/s3-client');

  const entries: MetadataRoute.Sitemap = [];
  const today = new Date();
  const topics = [
    'capital',
    'english',
    'finance',
    'market',
    'prnewswire',
    'real_estate',
    'special',
  ];

  for (let i = 0; i < 3; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    for (const topic of topics) {
      const prefix = `prna/items/${dateStr}/${topic}/`;

      try {
        const listResponse = await s3Client.send(
          new ListObjectsV2Command({
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Prefix: prefix,
            MaxKeys: 100,
          }),
        );

        if (!listResponse.Contents) continue;

        for (const obj of listResponse.Contents) {
          if (!obj.Key?.endsWith('.json')) continue;

          try {
            const getResponse = await s3Client.send(
              new GetObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET_NAME,
                Key: obj.Key,
              }),
            );

            const content = await getResponse.Body?.transformToString();
            if (!content) continue;

            const article = JSON.parse(content);
            const encodedUrl = Buffer.from(article.link).toString(
              'base64',
            );

            entries.push({
              url: `${siteUrl}/discover/article/${encodedUrl}`,
              lastModified: new Date(
                article.published_iso || article.published,
              ),
              changeFrequency: 'weekly',
              priority: 0.7,
            });
          } catch {
            continue;
          }
        }
      } catch {
        continue;
      }
    }
  }

  return entries;
}
