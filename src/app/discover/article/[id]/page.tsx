'use client';
import { useEffect, useState } from 'react';
import he from 'he';
import { ExternalLink } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Discover } from '@/lib/types/discover';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

function ArticlePage() {
  const params = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [article, setArticle] = useState<Discover | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.id) {
      setLoading(false);
      return;
    }
    const fetchArticle = () => {
      try {
        const decodedUrl = Buffer.from(params.id, 'base64').toString('utf-8');
        const articlesJson = sessionStorage.getItem('discover_articles');
        if (articlesJson) {
          const articles: Discover[] = JSON.parse(articlesJson);
          const foundArticle = articles.find((a) => a.url === decodedUrl);
          if (foundArticle) {
            setArticle(foundArticle);
          } else {
            console.error('Article not found in sessionStorage');
          }
        } else {
          console.error('No articles found in sessionStorage');
        }
      } catch (error) {
        console.error('Error fetching or finding article:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchArticle();
  }, [params.id]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!article) {
    return <div>Article not found</div>;
  }

  const formattedDate = article.pubDate
    ? new Date(article.pubDate).toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    : '';

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Link
            href="/discover"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            ニュース一覧に戻る
          </Link>
        </div>
        <h1
          className="text-4xl font-bold mb-4"
          style={{ fontFamily: 'PP Editorial, serif' }}
        >
          {he.decode(article.title)}
        </h1>
        <div className="flex items-center text-sm text-gray-500 mb-4">
          <span>{formattedDate}</span>
          {article.author && (
            <span className="ml-4 bg-gray-200 dark:bg-gray-700 rounded-full px-3 py-1 text-xs">
              {article.author}
            </span>
          )}
        </div>
        <div className="relative aspect-video overflow-hidden rounded-lg mb-8">
          <Image
            src={article.thumbnail}
            alt={article.title}
            layout="fill"
            objectFit="cover"
          />
        </div>
        <div className="prose dark:prose-invert max-w-none">
          <p>{he.decode(article.content)}</p>
        </div>
        <div className="flex items-center gap-4 mt-8">
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
          >
            元記事を読む <ExternalLink size={14} />
          </a>
          <Link
            href={`/?q=「${article.title}」を日本語で要約してください`}
            className="text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
            target="_blank"
          >
            {t('readAiSummary')}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ArticlePage;
