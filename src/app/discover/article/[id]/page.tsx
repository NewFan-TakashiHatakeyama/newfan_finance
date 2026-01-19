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

interface ArticleDetail extends Discover {
  contentHtml?: string; // HTMLコンテンツ
}

function ArticlePage() {
  const params = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.id) {
      setLoading(false);
      return;
    }
    const fetchArticle = async () => {
      try {
        console.log('Fetching article detail from API...');
        
        // 新しいAPIエンドポイントから記事詳細を取得
        // URLエンコードされたIDをそのまま使用（Next.jsが自動的に処理）
        const apiUrl = `/api/discover/article/${encodeURIComponent(params.id)}`;
        console.log('Fetching from API:', apiUrl);
        
        const res = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (data.article) {
            setArticle({
              ...data.article,
              contentHtml: data.article.content, // HTMLコンテンツを保持
            });
          } else {
            console.error('Article data not found in response');
          }
        } else {
          const errorData = await res.json().catch(() => ({}));
          console.error('API error:', res.status, errorData);
        }
      } catch (error) {
        console.error('Error fetching article detail:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchArticle();
  }, [params.id]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* スケルトン: 戻るボタン */}
          <div className="mb-8 animate-pulse">
            <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
          
          {/* スケルトン: タイトル */}
          <div className="mb-4 animate-pulse">
            <div className="h-12 w-full bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
            <div className="h-12 w-3/4 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
          
          {/* スケルトン: 日付・著者 */}
          <div className="mb-8 animate-pulse">
            <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
          
          {/* スケルトン: 画像 */}
          <div className="relative aspect-video overflow-hidden rounded-lg mb-8 animate-pulse">
            <div className="w-full h-full bg-gray-200 dark:bg-gray-700"></div>
          </div>
          
          {/* スケルトン: コンテンツ */}
          <div className="prose dark:prose-invert max-w-none space-y-4 animate-pulse">
            <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-4 w-5/6 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-4 w-4/5 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        </div>
      </div>
    );
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

  // 画像が有効かどうかを判定する関数
  const isValidThumbnail = (thumbnail: string | undefined): boolean => {
    if (!thumbnail) return false;
    const trimmed = thumbnail.trim();
    if (trimmed === '') return false;
    if (trimmed.includes('/ad_placeholder')) return false;
    if (trimmed.startsWith('data:')) return false; // データURIも除外
    return true;
  };

  const hasValidThumbnail = isValidThumbnail(article.thumbnail);

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
        {hasValidThumbnail && (
          <div className="relative aspect-video overflow-hidden rounded-lg mb-8">
            <Image
              src={article.thumbnail}
              alt={article.title}
              layout="fill"
              objectFit="cover"
            />
          </div>
        )}
        <div className="prose dark:prose-invert max-w-none">
          {article.contentHtml ? (
            <div 
              dangerouslySetInnerHTML={{ __html: article.contentHtml }}
              className="article-content"
            />
          ) : (
            <p>{he.decode(article.content)}</p>
          )}
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
