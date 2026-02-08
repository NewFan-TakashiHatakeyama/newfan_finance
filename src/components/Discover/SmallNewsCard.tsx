import { Discover } from '@/lib/types/discover';
import Link from 'next/link';
import Image from 'next/image';
import he from 'he';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';

/**
 * 画像が有効かどうかを判定する
 */
const isValidThumbnail = (thumbnail: string | undefined): boolean => {
  if (!thumbnail) return false;
  const trimmed = thumbnail.trim();
  if (trimmed === '') return false;
  if (trimmed.includes('/ad_placeholder')) return false;
  if (trimmed.startsWith('data:')) return false;
  return true;
};

const SmallNewsCard = ({ item }: { item: Discover }) => {
  const { t } = useTranslation();
  const [hasValidThumbnail, setHasValidThumbnail] = useState(
    isValidThumbnail(item.thumbnail),
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
    setHasValidThumbnail(false);
  };

  return (
    <Link
      href={`/discover/article/${encodedUrl}`}
      className="overflow-hidden bg-light-secondary dark:bg-dark-secondary shadow-sm shadow-light-200/10 dark:shadow-black/25 group flex flex-col"
    >
      {hasValidThumbnail && (
        <div className="relative aspect-video overflow-hidden">
          <Image
            src={item.thumbnail!}
            alt={item.title ? he.decode(item.title) : ''}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            loading="lazy"
            onError={handleImageError}
          />
        </div>
      )}
      <div className="p-4 flex flex-col flex-grow">
        <h3 className="font-semibold text-sm mb-2 leading-tight line-clamp-2">
          {item.title && he.decode(item.title)}
        </h3>
        <div className="text-xs text-black/50 dark:text-white/50 mb-2">
          <span>{formattedDate}</span>
          {item.author && <span> / {item.author}</span>}
        </div>
        <div className="flex items-center gap-4 mt-auto">
          <span className="text-xs text-cyan-600 dark:text-cyan-400 group-hover:underline flex items-center gap-1 font-semibold">
            記事全文を読む
            <ArrowRight size={12} />
          </span>
        </div>
      </div>
    </Link>
  );
};

export default SmallNewsCard;
