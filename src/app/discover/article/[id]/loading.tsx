/**
 * 記事詳細ページの Suspense ローディング UI
 *
 * Server Component のデータ取得中に表示されるスケルトン。
 * CSR 時代の useState/useEffect ベースのスケルトンと異なり、
 * Next.js の Suspense boundary により自動的に制御される。
 */
export default function ArticleLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* スケルトン: 戻るボタン */}
        <div className="mb-8 animate-pulse">
          <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>

        {/* スケルトン: タイトル */}
        <div className="mb-4 animate-pulse space-y-2">
          <div className="h-12 w-full bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-12 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>

        {/* スケルトン: 日付・著者 */}
        <div className="mb-8 animate-pulse">
          <div className="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>

        {/* スケルトン: 画像 */}
        <div className="relative aspect-video overflow-hidden rounded-lg mb-8 animate-pulse">
          <div className="w-full h-full bg-gray-200 dark:bg-gray-700" />
        </div>

        {/* スケルトン: コンテンツ */}
        <div className="space-y-4 animate-pulse">
          <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-4 w-5/6 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-4 w-4/5 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    </div>
  );
}
