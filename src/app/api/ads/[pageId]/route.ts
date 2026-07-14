/**
 * 広告取得プロキシ API ルート（改修2）
 *   配置: src/app/api/ads/[pageId]/route.ts
 *
 * 役割: 回答ページの RagAds コンポーネントからの広告取得を、広告システムの配信API
 *   （GET {RAG_ADS_API_BASE}/v1/pages/{pageId}/ads）へサーバー側でプロキシする。
 *   - 広告システムのエンドポイントを同一オリジン（/api/ads）に隠蔽しCORSを回避。
 *   - 表示計測の正確性のため Cache-Control: no-store を維持。
 *   - 広告処理の失敗は回答表示を妨げないフェイルセーフ（常に200・失敗時は空配列）。
 *
 * 環境変数: RAG_ADS_API_BASE（サーバー側）
 */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RAG_ADS_API_BASE = process.env.RAG_ADS_API_BASE ?? '';
const TIMEOUT_MS = 3000;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const { pageId } = await params;
  const empty = () =>
    NextResponse.json(
      { pageId, ads: [] },
      { headers: { 'Cache-Control': 'no-store' } },
    );

  // pageId形式チェック（広告システム側と同一。決定C: assistantMessage.messageId=英数・-・_、8〜64字）。不正は空配列
  if (!RAG_ADS_API_BASE || !/^[0-9a-zA-Z_-]{8,64}$/.test(pageId)) return empty();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `${RAG_ADS_API_BASE}/v1/pages/${encodeURIComponent(pageId)}/ads`,
      { cache: 'no-store', signal: ctrl.signal },
    );
    if (!res.ok) return empty();
    const data = await res.json();
    return NextResponse.json(
      { pageId, ads: Array.isArray(data.ads) ? data.ads : [] },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return empty(); // タイムアウト・通信失敗は空配列（フェイルセーフ）
  } finally {
    clearTimeout(timer);
  }
}
