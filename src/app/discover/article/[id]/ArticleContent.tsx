'use client';

import { ExternalLink, ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArticleData } from '@/lib/services/article-fetcher';

interface ArticleContentProps {
  article: ArticleData;
}

/**
 * 記事コンテンツの Client Component
 *
 * インタラクティブ要素 (ボタン、useTranslation 等) のみ
 * Client Component として分離。
 * データは Server Component (page.tsx) で取得済みの props として受け取る。
 */
export default function ArticleContent({ article }: ArticleContentProps) {
  const { t } = useTranslation();

  const formattedDate = article.pubDate
    ? new Date(article.pubDate).toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    : '';

  const isValidThumbnail = (thumbnail: string | undefined): boolean => {
    if (!thumbnail) return false;
    const trimmed = thumbnail.trim();
    if (trimmed === '') return false;
    if (trimmed.includes('/ad_placeholder')) return false;
    if (trimmed.startsWith('data:')) return false;
    return true;
  };

  const hasValidThumbnail = isValidThumbnail(article.thumbnail);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* 戻るボタン */}
        <div className="mb-8">
          <Link
            href="/discover"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            ニュース一覧に戻る
          </Link>
        </div>

        {/* タイトル */}
        <h1
          className="text-4xl font-bold mb-4"
          style={{ fontFamily: 'PP Editorial, serif' }}
        >
          {article.title}
        </h1>

        {/* 日付・著者 */}
        <div className="flex items-center text-sm text-gray-500 mb-4">
          <span>{formattedDate}</span>
          {article.author && (
            <span className="ml-4 bg-gray-200 dark:bg-gray-700 rounded-full px-3 py-1 text-xs">
              {article.author}
            </span>
          )}
        </div>

        {/* サムネイル画像 */}
        {hasValidThumbnail && (
          <div className="relative aspect-video overflow-hidden rounded-lg mb-8">
            <Image
              src={article.thumbnail}
              alt={article.title}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 896px"
              priority
            />
          </div>
        )}

        {/* 記事コンテンツ */}
        <div className="prose dark:prose-invert max-w-none">
          {article.content ? (
            <div
              dangerouslySetInnerHTML={{ __html: article.content }}
              className="article-content"
            />
          ) : (
            <p>{article.plainTextContent}</p>
          )}
        </div>

        {/* アクションリンク */}
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
