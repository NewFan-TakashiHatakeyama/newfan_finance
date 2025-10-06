import { Discover } from '@/app/discover/page';
import Link from 'next/link';
import he from 'he';
import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const MajorNewsCard = ({
  item,
  isLeft = true,
}: {
  item: Discover;
  isLeft?: boolean;
}) => {
  const { t } = useTranslation();
  const formattedDate = item.pubDate
    ? new Date(item.pubDate).toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    : '';

  return (
    <div className="w-full group flex flex-row items-stretch gap-6 h-60 py-3">
      {isLeft ? (
        <>
          <div className="relative w-80 h-full overflow-hidden flex-shrink-0 block">
            <img
              className="object-cover w-full h-full"
              src={item.thumbnail}
              alt={item.title}
            />
          </div>
          <div className="flex flex-col justify-center flex-1 py-4">
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
            <p className="text-black/60 dark:text-white/60 text-base leading-relaxed line-clamp-2 flex-grow">
              {item.content && he.decode(item.content)}
            </p>
            <div className="flex items-center gap-4 mt-2">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
              >
                元記事を読む <ExternalLink size={14} />
              </a>
              <Link
                href={`/?q=「${item.title}」を日本語で要約してください`}
                className="text-sm text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
                target="_blank"
              >
                {t('readAiSummary')}
              </Link>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col justify-center flex-1 py-4">
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
            <p className="text-black/60 dark:text-white/60 text-base leading-relaxed line-clamp-2 flex-grow">
              {item.content && he.decode(item.content)}
            </p>
            <div className="flex items-center gap-4 mt-2">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
              >
                元記事を読む <ExternalLink size={14} />
              </a>
              <Link
                href={`/?q=「${item.title}」を日本語で要約してください`}
                className="text-sm text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
                target="_blank"
              >
                {t('readAiSummary')}
              </Link>
            </div>
          </div>
          <div className="relative w-80 h-full overflow-hidden flex-shrink-0 block">
            <img
              className="object-cover w-full h-full"
              src={item.thumbnail}
              alt={item.title}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default MajorNewsCard;
