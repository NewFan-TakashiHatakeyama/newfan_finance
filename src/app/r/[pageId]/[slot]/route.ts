/**
 * クリック計測転送ルート（改修3・決定D）
 *   配置: src/app/r/[pageId]/[slot]/route.ts
 *
 * 役割: 広告カードのリンク（/r/{pageId}/{slot}・媒体オリジン相対）を、広告システムの
 *   クリック計測エンドポイント（GET {RAG_ADS_API_BASE}/r/{pageId}/{slot}）へサーバー側で転送する。
 *   広告システムが clicks を加算し landingUrl（Placementスナップショット）へ 302 を返すので、
 *   その Location をそのままユーザーへ再送する。
 *
 * 動的ルート採用理由: 本プロジェクトは next.config の output:'standalone' で、env はホスティングの
 *   ランタイムで注入される。next.config の rewrites() は RAG_ADS_API_BASE をビルド時に焼き込むため、
 *   リクエスト時に process.env を読む動的ルートの方が確実（/api/ads プロキシと機構を統一）。
 *
 * フェイルセーフ: BASE未設定・pageId/slot不正・通信失敗・302以外は、オープンリダイレクトを避けて
 *   サイトトップ（/）へ 302（広告システム側の /r と同一の縮退挙動）。
 *
 * 環境変数: RAG_ADS_API_BASE（サーバー側）
 */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RAG_ADS_API_BASE = process.env.RAG_ADS_API_BASE ?? '';
const TIMEOUT_MS = 3000;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ pageId: string; slot: string }> },
) {
  const { pageId, slot } = await params;

  // 計測は毎回成立させたいのでキャッシュさせない
  const toHome = () => {
    const res = NextResponse.redirect(new URL('/', req.url), 302);
    res.headers.set('Cache-Control', 'no-store');
    return res;
  };

  // pageId は決定C（英数・-・_、8〜64字）、slot は 1〜99。不正はトップへ
  if (
    !RAG_ADS_API_BASE ||
    !/^[0-9a-zA-Z_-]{8,64}$/.test(pageId) ||
    !/^[1-9][0-9]?$/.test(slot)
  ) {
    return toHome();
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetch(
      `${RAG_ADS_API_BASE}/r/${encodeURIComponent(pageId)}/${encodeURIComponent(slot)}`,
      { redirect: 'manual', cache: 'no-store', signal: ctrl.signal },
    );

    // 広告システムは 302 + Location(landingUrl) を返す。それをそのまま再送。
    const location = upstream.headers.get('location');
    if (upstream.status >= 300 && upstream.status < 400 && location) {
      const res = NextResponse.redirect(location, 302);
      res.headers.set('Cache-Control', 'no-store');
      return res;
    }
    return toHome();
  } catch {
    return toHome(); // タイムアウト・通信失敗はトップへ（フェイルセーフ）
  } finally {
    clearTimeout(timer);
  }
}
