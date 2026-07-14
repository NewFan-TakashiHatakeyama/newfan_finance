'use client';

/**
 * RagAds — NewFan-Finance 回答ページ広告ブロック（改修1 / FE-01）
 *
 * 既存のダミースタブを本ファイルで置換する。Perplexica の Tailwind トークン（light-/dark-）に合わせ、
 * 回答ページの Related 直上に配置する（MessageBox.tsx から <RagAds pageId={messageId} /> で使用）。
 *
 * 挙動:
 *  - マウント時に広告取得API（既定 /api/ads/{pageId} プロキシ）をフェッチ。回答本文の描画と独立。
 *  - **0件ならリトライ**（生成API は 2〜7秒かかるため。INTERVAL=1800ms・最大 MAX_TRIES=4 回）。
 *    出た時点で確定・出なければ collapse。各フェッチは3秒タイムアウト・cache:'no-store'。
 *  - 取得完了まで高さを予約（PC 240px / SP 160px）しCLSを防ぐ。リトライ中も loading（予約）を維持。
 *  - 「広告」ラベルは全カード必須・オレンジ固定（景表法ステマ規制対応。非表示化のコードパスを設けない）。
 *  - 広告由来テキストは React の既定エスケープで描画（dangerouslySetInnerHTML 禁止）。
 *  - リンクは計測URL（clickUrl=/r/{pageId}/{slot}）経由・target=_blank・rel="nofollow sponsored noopener"。
 *
 * 計測: 表示(impression) は本フェッチ（page-ads）が広告を返したときにのみ広告システム側で計上される
 *   （0件フェッチでは計上されない＝リトライで過剰計上にならない）。
 */

import React from 'react';

export type Ad = {
  slot: number;
  adId: string;
  label: string;
  lead: string;
  title: string;
  imageUrl: string | null;
  clickUrl: string;
};

type Props = {
  /** 回答ページID。回答単位のため assistantMessage.messageId を渡す（決定C）。 */
  pageId: string;
  /** 初回生成応答で ads[] が渡る場合はフェッチを省略して直接描画（現仕様では非推奨・通常未使用）。 */
  initialAds?: Ad[];
  /** 広告取得のベースパス。既定は同一オリジンのプロキシ /api/ads。 */
  apiBase?: string;
};

const MAX_TRIES = 4; // 0件時の最大リトライ回数
const INTERVAL = 1800; // リトライ間隔（ms）。生成待ちのため1.5秒以上
const FETCH_TIMEOUT = 3000; // 1フェッチあたりのタイムアウト（ms）

const RagAds = ({ pageId, initialAds, apiBase = '/api/ads' }: Props) => {
  const [state, setState] = React.useState<{ phase: 'loading' | 'resolved'; ads: Ad[] }>(
    Array.isArray(initialAds)
      ? { phase: 'resolved', ads: initialAds }
      : { phase: 'loading', ads: [] },
  );

  React.useEffect(() => {
    if (Array.isArray(initialAds)) return; // フェッチ省略

    let cancelled = false;
    let tries = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let fetchTimer: ReturnType<typeof setTimeout> | undefined;
    let ctrl: AbortController | undefined;

    const poll = async () => {
      if (cancelled) return;
      ctrl = new AbortController();
      fetchTimer = setTimeout(() => ctrl?.abort(), FETCH_TIMEOUT);

      let ads: Ad[] = [];
      try {
        const res = await fetch(`${apiBase}/${encodeURIComponent(pageId)}`, {
          cache: 'no-store',
          signal: ctrl.signal,
        });
        const data = res.ok ? await res.json() : { ads: [] };
        ads = Array.isArray(data.ads) ? data.ads : [];
      } catch {
        ads = []; // タイムアウト・通信失敗は 0件扱い
      } finally {
        if (fetchTimer) clearTimeout(fetchTimer);
      }

      if (cancelled) return;
      tries += 1;
      if (ads.length > 0 || tries >= MAX_TRIES) {
        setState({ phase: 'resolved', ads }); // 確定（0件なら以降 collapse）
      } else {
        retryTimer = setTimeout(poll, INTERVAL); // まだ生成待ち → 再試行（loading維持）
      }
    };

    poll();

    return () => {
      cancelled = true;
      ctrl?.abort();
      if (fetchTimer) clearTimeout(fetchTimer);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [pageId, apiBase, initialAds]);

  // 取得完了まで高さのみ予約（スケルトンは表示しない）
  if (state.phase === 'loading') {
    return <div aria-hidden className="min-h-[240px] md:min-h-[240px] max-md:min-h-[160px]" />;
  }
  if (state.ads.length === 0) return null; // 0件はブロックごと非表示

  const ads = [...state.ads].sort((a, b) => a.slot - b.slot); // slot昇順=生成時スコア降順

  return (
    <div className="mt-8 pt-6 border-t border-light-200/50 dark:border-dark-200/50">
      <h3 className="text-xs text-black/60 dark:text-white/60 mb-4">スポンサー</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {ads.map((ad) => (
          <AdCard key={ad.slot} ad={ad} />
        ))}
      </div>
    </div>
  );
};

const AdCard = ({ ad }: { ad: Ad }) => {
  const [imgFailed, setImgFailed] = React.useState(false);
  return (
    <a
      href={ad.clickUrl}
      target="_blank"
      rel="nofollow sponsored noopener"
      className="flex flex-col gap-2 p-3 border border-light-200/50 dark:border-dark-200/50 rounded-lg hover:bg-light-secondary/50 dark:hover:bg-dark-secondary/50 transition-colors duration-200"
    >
      {/* 「広告」ラベル: オレンジ固定・常時表示（景表法ステマ規制対応・F-13） */}
      <span className="self-start rounded px-2 py-0.5 text-[10px] font-bold tracking-wide text-white bg-[#E8862E]">
        {ad.label || '広告'}
      </span>
      <p className="text-xs leading-relaxed text-black/80 dark:text-white/80 line-clamp-3">
        {ad.lead}
      </p>
      {ad.imageUrl && !imgFailed && (
        <div className="aspect-video overflow-hidden rounded-md bg-light-secondary dark:bg-dark-secondary">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ad.imageUrl}
            alt=""
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <p className="text-sm font-bold text-black dark:text-white truncate">{ad.title}</p>
      <p className="mt-auto text-xs font-medium text-[#0E7C78] dark:text-[#3BA9A4]">詳細を見る →</p>
    </a>
  );
};

export default RagAds;
