/**
 * 動画検索 API
 *
 * 現在 SearxNG は仕様外のため、動画検索機能は無効化。
 * フロントエンド互換性のため空の結果を返す。
 */
export const POST = async (_req: Request) => {
  return Response.json({ videos: [] }, { status: 200 });
};
