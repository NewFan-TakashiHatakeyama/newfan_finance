import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getArticleById,
  ArticleData,
} from '@/lib/services/article-fetcher';
import ArticleContent from './ArticleContent';

/**
 * ISR: 5 分間キャッシュされた HTML を返し、
 * バックグラウンドで再生成する (stale-while-revalidate)
 */
export const revalidate = 300;

// --- Dynamic Metadata (SEO) ---

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  const article = await getArticleById(resolvedParams.id);

  if (!article) {
    return {
      title: '記事が見つかりません | NewFan-Finance',
    };
  }

  const description = article.plainTextContent.slice(0, 160);
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || 'https://finance.newfan.co.jp';
  const articleUrl = `${siteUrl}/discover/article/${resolvedParams.id}`;

  return {
    title: `${article.title} | NewFan-Finance`,
    description,
    openGraph: {
      title: article.title,
      description,
      url: articleUrl,
      siteName: 'NewFan-Finance',
      type: 'article',
      publishedTime: article.pubDate,
      authors: [article.author],
      ...(article.thumbnail && {
        images: [
          {
            url: article.thumbnail,
            width: 1200,
            height: 630,
            alt: article.title,
          },
        ],
      }),
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description,
      ...(article.thumbnail && { images: [article.thumbnail] }),
    },
    alternates: {
      canonical: articleUrl,
    },
  };
}

// --- カテゴリ表示名変換 ---

const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  finance: '金融・投資',
  market: '市場動向',
  capital: '資本取引',
  real_estate: '不動産',
  special: '専門分野',
  english: 'English',
  prnewswire: 'PR Newswire',
};

function getCategoryDisplayName(category: string): string {
  return CATEGORY_DISPLAY_NAMES[category] || category || 'ニュース';
}

// --- JSON-LD 構造化データ ---

function generateArticleJsonLd(
  article: ArticleData,
  id: string,
): object {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || 'https://finance.newfan.co.jp';

  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title,
    description: article.plainTextContent.slice(0, 160),
    url: `${siteUrl}/discover/article/${id}`,
    datePublished: article.pubDate,
    author: {
      '@type': 'Organization',
      name: article.author,
    },
    publisher: {
      '@type': 'Organization',
      name: '株式会社NewFan',
      url: 'https://www.newfan.co.jp',
      logo: {
        '@type': 'ImageObject',
        url: `${siteUrl}/icon.png`,
      },
    },
    ...(article.thumbnail && {
      image: {
        '@type': 'ImageObject',
        url: article.thumbnail,
      },
    }),
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${siteUrl}/discover/article/${id}`,
    },
  };
}

// --- パンくずリスト JSON-LD ---

function generateBreadcrumbJsonLd(
  article: ArticleData,
  id: string,
): object {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || 'https://finance.newfan.co.jp';
  const categoryName = getCategoryDisplayName(article.category);

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'ホーム',
        item: siteUrl,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'ニュース',
        item: `${siteUrl}/discover`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: categoryName,
        item: `${siteUrl}/discover?topic=${article.category}`,
      },
      {
        '@type': 'ListItem',
        position: 4,
        name: article.title,
        item: `${siteUrl}/discover/article/${id}`,
      },
    ],
  };
}

// --- Page Component (Server) ---

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const article = await getArticleById(resolvedParams.id);

  if (!article) {
    notFound();
  }

  const articleJsonLd = generateArticleJsonLd(article, resolvedParams.id);
  const breadcrumbJsonLd = generateBreadcrumbJsonLd(
    article,
    resolvedParams.id,
  );

  return (
    <>
      {/* NewsArticle JSON-LD 構造化データ */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />

      {/* BreadcrumbList JSON-LD 構造化データ */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      {/* 記事コンテンツ (Client Component) */}
      <ArticleContent article={article} />
    </>
  );
}
