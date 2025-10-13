import { Discover } from '@/lib/types/discover';
import Link from 'next/link';
import he from 'he';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const SmallNewsCard = ({ item }: { item: Discover }) => {
  const { t } = useTranslation();
  const formattedDate = item.pubDate
    ? new Date(item.pubDate).toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    : '';

  const encodedUrl = Buffer.from(item.url).toString('base64');

  return (
    <Link
      href={`/discover/article/${encodedUrl}`}
      className="overflow-hidden bg-light-secondary dark:bg-dark-secondary shadow-sm shadow-light-200/10 dark:shadow-black/25 group flex flex-col"
    >
      <div className="relative aspect-video overflow-hidden">
        <img
          className="object-cover w-full h-full"
          src={item.thumbnail}
          alt={item.title}
        />
      </div>
      <div className="p-4 flex flex-col flex-grow">
        <h3 className="font-semibold text-sm mb-2 leading-tight line-clamp-2">
          {item.title && he.decode(item.title)}
        </h3>
        <div className="text-xs text-black/50 dark:text-white/50 mb-2">
          <span>{formattedDate}</span>
          {item.author && <span> / {item.author}</span>}
        </div>
        <p className="text-black/60 dark:text-white/60 text-xs leading-relaxed line-clamp-2 flex-grow">
          {item.content && he.decode(item.content)}
        </p>
        <div className="flex items-center gap-4 mt-2">
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
