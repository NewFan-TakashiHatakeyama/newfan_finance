'use client';

import { ExternalLink, ArrowLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArticleData } from '@/lib/services/article-fetcher';
import { sanitizeArticleHtml } from '@/lib/utils/sanitize-html';

interface ArticleContentProps {
  article: ArticleData;
}

/**
 * カテゴリキーを日本語表示名に変換
 */
function getCategoryDisplayName(category: string): string {
  const map: Record<string, string> = {
    finance: '金融・投資',
    market: '市場動向',
    capital: '資本取引',
    real_estate: '不動産',
    special: '専門分野',
    prnewswire: 'PR Newswire',
  };
  return map[category] || category || 'ニュース';
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

  // XSS 対策: 外部 HTML コンテンツをサニタイズ
  const sanitizedContent = useMemo(() => {
    if (!article.content) return '';
    return sanitizeArticleHtml(article.content);
  }, [article.content]);

  const categoryName = getCategoryDisplayName(article.category);

  // 出典ドメインを抽出
  const sourceDomain = useMemo(() => {
    try {
      return new URL(article.url).hostname;
    } catch {
      return '';
    }
  }, [article.url]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* パンくずリスト (Breadcrumb) */}
        <nav
          aria-label="パンくずリスト"
          className="mb-6 text-sm text-gray-500 dark:text-gray-400"
        >
          <ol className="flex items-center flex-wrap gap-1">
            <li>
              <Link
                href="/"
                className="hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              >
                ホーム
              </Link>
            </li>
            <li>
              <ChevronRight className="h-3 w-3 mx-1 inline" />
            </li>
            <li>
              <Link
                href="/discover"
                className="hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              >
                ニュース
              </Link>
            </li>
            <li>
              <ChevronRight className="h-3 w-3 mx-1 inline" />
            </li>
            <li>
              <span className="text-gray-700 dark:text-gray-300">
                {categoryName}
              </span>
            </li>
          </ol>
        </nav>

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

        {/* 日付・著者・出典 */}
        <div className="flex items-center flex-wrap gap-2 text-sm text-gray-500 dark:text-gray-400 mb-6">
          <span>{formattedDate}</span>
          {article.author && (
            <span className="bg-gray-200 dark:bg-gray-700 rounded-full px-3 py-1 text-xs">
              {article.author}
            </span>
          )}
          {sourceDomain && (
            <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full px-3 py-1 text-xs">
              出典: {sourceDomain}
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

        {/* 出典情報バナー */}
        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-8">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            この記事は外部ニュースソースから配信されたコンテンツです。
            内容に関するお問い合わせは、元記事の配信元にご連絡ください。
          </p>
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline mt-1 inline-flex items-center gap-1"
          >
            元記事: {sourceDomain} <ExternalLink size={10} />
          </a>
        </div>

        {/* 記事コンテンツ (サニタイズ済み) */}
        <div className="prose dark:prose-invert max-w-none">
          {sanitizedContent ? (
            <div
              dangerouslySetInnerHTML={{ __html: sanitizedContent }}
              className="article-content"
            />
          ) : (
            <p>{article.plainTextContent}</p>
          )}
        </div>

        {/* アクションリンク */}
        <div className="flex items-center gap-4 mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
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
