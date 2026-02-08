import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/**
 * 記事が見つからない場合の 404 ページ
 *
 * Server Component の page.tsx で notFound() が呼ばれた際に表示される。
 */
export default function ArticleNotFound() {
  return (
    <div className="container mx-auto px-4 py-20">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl font-bold mb-4">記事が見つかりません</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">
          この記事は存在しないか、削除された可能性があります。
        </p>
        <Link
          href="/discover"
          className="inline-flex items-center text-cyan-600 dark:text-cyan-400 hover:underline"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          ニュース一覧に戻る
        </Link>
      </div>
    </div>
  );
}
