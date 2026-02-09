'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import SmallNewsCard from '@/components/Discover/SmallNewsCard';
import MajorNewsCard from '@/components/Discover/MajorNewsCard';
import { useTranslation } from 'react-i18next';
import Image from 'next/image';
import { Discover } from '@/lib/types/discover';

/** 1ページあたりの記事数 */
const PAGE_SIZE = 20;

const Page = () => {
  const { t } = useTranslation();
  const topics: { key: string; display: string }[] = [
    {
      display: t('financeAndInvestment'),
      key: 'finance',
    },
    {
      display: t('marketTrendsAndPerformance'),
      key: 'market',
    },
    {
      display: t('capitalTransactions'),
      key: 'capital',
    },
    {
      display: t('realEstate'),
      key: 'real_estate',
    },
    {
      display: t('specializedFields'),
      key: 'special',
    },
    {
      display: t('englishNews'),
      key: 'english',
    },
    {
      display: t('prNewswire'),
      key: 'prnewswire',
    },
  ];

  const [discover, setDiscover] = useState<Discover[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTopic, setActiveTopic] = useState<string>(topics[0].key);

  // ページネーション状態
  const [currentPage, setCurrentPage] = useState(1);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  /** 各ページの先頭カーソルを記録 (前のページに戻るため) */
  const [cursorHistory, setCursorHistory] = useState<(string | undefined)[]>([
    undefined,
  ]);

  const fetchArticles = useCallback(
    async (topic: string, cursor?: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          topic,
          limit: String(PAGE_SIZE),
        });
        if (cursor) params.set('cursor', cursor);

        const res = await fetch(`/api/discover?${params.toString()}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.message || 'Failed to fetch articles');
        }

        const blogs: Discover[] = data.blogs || [];
        setDiscover(blogs);
        setNextCursor(data.nextCursor || null);
      } catch (err: any) {
        console.error('[Discover Page] Error fetching data:', err);
        toast.error(`記事の取得に失敗しました: ${err.message || ''}`);
        setDiscover([]);
        setNextCursor(null);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // トピック変更時: 1ページ目にリセット
  useEffect(() => {
    setCurrentPage(1);
    setCursorHistory([undefined]);
    setNextCursor(null);
    fetchArticles(activeTopic);
  }, [activeTopic, fetchArticles]);

  /** 次のページへ */
  const goToNextPage = () => {
    if (!nextCursor) return;
    const newPage = currentPage + 1;
    setCursorHistory((prev) => {
      const updated = [...prev];
      // 新しいページのカーソルを記録
      if (updated.length <= currentPage) {
        updated.push(nextCursor);
      } else {
        updated[currentPage] = nextCursor;
      }
      return updated;
    });
    setCurrentPage(newPage);
    fetchArticles(activeTopic, nextCursor);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /** 前のページへ */
  const goToPrevPage = () => {
    if (currentPage <= 1) return;
    const newPage = currentPage - 1;
    setCurrentPage(newPage);
    const prevCursor = cursorHistory[newPage - 1]; // 0-indexed
    fetchArticles(activeTopic, prevCursor);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <div>
        <div className="flex flex-col pt-10 border-b border-light-200/20 dark:border-dark-200/20 pb-6 px-2">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center justify-center">
              <Image
                src="/title_logo.png"
                alt="logo"
                width={200}
                height={50}
                style={{ width: 'auto', height: 'auto' }}
              />
            </div>
            <div className="flex flex-row flex-wrap items-center gap-2">
              {topics.map((t, i) => (
                <div
                  key={i}
                  className={cn(
                    'border-[0.1px] rounded-full text-sm px-3 py-1 whitespace-nowrap transition duration-200 cursor-pointer',
                    activeTopic === t.key
                      ? 'text-cyan-700 dark:text-cyan-300 bg-cyan-300/20 border-cyan-700/60 dar:bg-cyan-300/30 dark:border-cyan-300/40'
                      : 'border-black/30 dark:border-white/30 text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white hover:border-black/40 dark:hover:border-white/40 hover:bg-black/5 dark:hover:bg-white/5',
                  )}
                  onClick={() => setActiveTopic(t.key)}
                >
                  <span>{t.display}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-screen py-20">
            {/* モダンなスピナー */}
            <div className="relative w-16 h-16 mb-4">
              <div className="absolute inset-0 border-4 border-cyan-200 dark:border-cyan-900 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-transparent border-t-cyan-600 dark:border-t-cyan-400 rounded-full animate-spin"></div>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium animate-pulse">
              記事を読み込んでいます...
            </p>
          </div>
        ) : (discover && discover.length > 0) ? (
          <div className="flex flex-col gap-4 pb-28 pt-5 lg:pb-8 w-full">
            {/* モバイル表示 */}
            <div className="block lg:hidden">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {discover.map((item, i) => (
                  <SmallNewsCard key={`mobile-${i}`} item={item} />
                ))}
              </div>
            </div>

            {/* デスクトップ表示 */}
            <div className="hidden lg:block">
              {(() => {
                  const sections = [];
                  let index = 0;

                  while (index < discover.length) {
                    if (sections.length > 0) {
                      sections.push(
                        <div key={`sep-${index}`} className="my-3" />
                      );
                    }

                    if (index < discover.length) {
                      sections.push(
                        <MajorNewsCard
                          key={`major-${index}`}
                          item={discover[index]}
                          isLeft={false}
                        />,
                      );
                      index++;
                    }

                    if (index < discover.length) {
                      sections.push(
                        <div key={`sep-${index}-after`} className="my-3" />
                      );
                    }

                    if (index < discover.length) {
                      const smallCards = discover.slice(index, index + 3);
                      sections.push(
                        <div
                          key={`small-group-${index}`}
                          className="grid lg:grid-cols-3 sm:grid-cols-2 grid-cols-1 gap-4"
                        >
                          {smallCards.map((item, i) => (
                            <SmallNewsCard
                              key={`small-${index + i}`}
                              item={item}
                            />
                          ))}
                        </div>,
                      );
                      index += 3;
                    }

                    if (index < discover.length) {
                      sections.push(
                        <div
                          key={`sep-${index}-after-small`}
                          className="my-3"
                        />
                      );
                    }

                    if (index < discover.length - 1) {
                      const twoMajorCards = discover.slice(index, index + 2);
                      twoMajorCards.forEach((item, i) => {
                        sections.push(
                          <MajorNewsCard
                            key={`double-${index + i}`}
                            item={item}
                            isLeft={i === 0}
                          />,
                        );
                        if (i === 0) {
                          sections.push(
                            <div
                              key={`sep-double-${index + i}`}
                              className="my-3"
                            />
                          );
                        }
                      });
                      index += 2;
                    } else if (index < discover.length) {
                      sections.push(
                        <MajorNewsCard
                          key={`final-major-${index}`}
                          item={discover[index]}
                          isLeft={true}
                        />,
                      );
                      index++;
                    }

                    if (index < discover.length) {
                      sections.push(
                        <div
                          key={`sep-${index}-after-major`}
                          className="my-3"
                        />
                      );
                    }

                    if (index < discover.length) {
                      const smallCards = discover.slice(index, index + 3);
                      sections.push(
                        <div
                          key={`small-group-2-${index}`}
                          className="grid lg:grid-cols-3 sm:grid-cols-2 grid-cols-1 gap-4"
                        >
                          {smallCards.map((item, i) => (
                            <SmallNewsCard
                              key={`small-2-${index + i}`}
                              item={item}
                            />
                          ))}
                        </div>,
                      );
                      index += 3;
                    }
                  }

                  return sections;
                })()}
            </div>

            {/* ページネーション */}
            <div className="flex items-center justify-center gap-4 py-6 mb-16 lg:mb-0">
              <button
                onClick={goToPrevPage}
                disabled={currentPage <= 1}
                className={cn(
                  'flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition duration-200',
                  currentPage <= 1
                    ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    : 'text-black dark:text-white bg-light-secondary dark:bg-dark-secondary hover:bg-light-200 dark:hover:bg-dark-200 cursor-pointer active:scale-95',
                )}
              >
                <ChevronLeft size={16} />
                前のページ
              </button>

              <span className="text-sm font-medium text-black/70 dark:text-white/70 min-w-[4rem] text-center">
                {currentPage} ページ
              </span>

              <button
                onClick={goToNextPage}
                disabled={!nextCursor}
                className={cn(
                  'flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition duration-200',
                  !nextCursor
                    ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    : 'text-black dark:text-white bg-light-secondary dark:bg-dark-secondary hover:bg-light-200 dark:hover:bg-dark-200 cursor-pointer active:scale-95',
                )}
              >
                次のページ
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[50vh] py-20">
            <p className="text-gray-500 dark:text-gray-400 text-lg">
              記事が見つかりませんでした
            </p>
          </div>
        )}
      </div>
    </>
  );
};

export default Page;
