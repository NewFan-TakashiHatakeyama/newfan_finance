import { Discover } from '@/lib/types/discover';
import Link from 'next/link';
import he from 'he';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';

const MajorNewsCard = ({
  item,
  isLeft = true,
}: {
  item: Discover;
  isLeft?: boolean;
}) => {
  const { t } = useTranslation();
  const [imageError, setImageError] = useState(false);
  
  // 画像が有効かどうかを判定する関数
  const isValidThumbnail = (thumbnail: string | undefined): boolean => {
    if (!thumbnail) return false;
    const trimmed = thumbnail.trim();
    if (trimmed === '') return false;
    if (trimmed.includes('/ad_placeholder')) return false;
    if (trimmed.startsWith('data:')) return false; // データURIも除外（必要に応じて）
    return true;
  };
  
  const [hasValidThumbnail, setHasValidThumbnail] = useState(
    isValidThumbnail(item.thumbnail)
  );

  const formattedDate = item.pubDate
    ? new Date(item.pubDate).toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    : '';

  const encodedUrl = Buffer.from(item.url).toString('base64');

  const handleImageError = () => {
    setImageError(true);
    setHasValidThumbnail(false);
  };

  return (
    <Link
      href={`/discover/article/${encodedUrl}`}
      className="w-full group flex flex-row items-stretch gap-6 h-60 py-3"
    >
      {isLeft ? (
        <>
          {hasValidThumbnail && !imageError && (
            <div className="relative w-80 h-full overflow-hidden flex-shrink-0 block">
              <img
                className="object-cover w-full h-full"
                src={item.thumbnail}
                alt={item.title}
                onError={handleImageError}
              />
            </div>
          )}
          <div className="flex flex-col justify-center flex-1 py-4 overflow-hidden">
            <h2
              className="text-3xl font-light mb-3 leading-tight line-clamp-2"
              style={{ fontFamily: 'PP Editorial, serif' }}
            >
              {item.title && he.decode(item.title)}
            </h2>
            <div className="text-sm text-black/50 dark:text-white/50 mb-2 flex items-center">
              <span>{formattedDate}</span>
              {item.author && (
                <span className="ml-2 px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded-full text-xs">
                  {item.author}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 mt-auto">
              <span className="text-sm text-cyan-600 dark:text-cyan-400 group-hover:underline flex items-center gap-1 font-semibold">
                記事全文を読む <ArrowRight size={14} />
              </span>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col justify-center flex-1 py-4 overflow-hidden">
            <h2
              className="text-3xl font-light mb-3 leading-tight line-clamp-2"
              style={{ fontFamily: 'PP Editorial, serif' }}
            >
              {item.title && he.decode(item.title)}
            </h2>
            <div className="text-sm text-black/50 dark:text-white/50 mb-2 flex items-center">
              <span>{formattedDate}</span>
              {item.author && (
                <span className="ml-2 px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded-full text-xs">
                  {item.author}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 mt-auto">
              <span className="text-sm text-cyan-600 dark:text-cyan-400 group-hover:underline flex items-center gap-1 font-semibold">
                記事全文を読む <ArrowRight size={14} />
              </span>
            </div>
          </div>
          {hasValidThumbnail && !imageError && (
            <div className="relative w-80 h-full overflow-hidden flex-shrink-0 block">
              <img
                className="object-cover w-full h-full"
                src={item.thumbnail}
                alt={item.title}
                onError={handleImageError}
              />
            </div>
          )}
        </>
      )}
    </Link>
  );
};

export default MajorNewsCard;
