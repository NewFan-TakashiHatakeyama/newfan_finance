/**
 * 広告ロールアウトゲート（改修5・ROLLOUT_newfan-finance-prod.md §1）
 *
 * main=prod（専用ステージング無し）のため、媒体側にコホート制御を設けて段階公開の対象を絞る。
 * `ADS_ROLLOUT`（サーバー側のみ・NEXT_PUBLIC不可）でモードを制御する:
 *   'off'（既定） | 'on'/'100' | '10' 等（%数値） | 'internal'（allowlist）
 *
 * key には安定値（sessionId 優先、無ければ chatId）を渡す。同一 key は常に同じ判定になり、
 * ユーザー体験が一貫する（出る人には常に出る／出ない人には常に出ない）。
 *
 * このゲートは chat route の生成API（finalizeAds）呼び出しのみを囲めばよい。ゲート外のユーザーは
 * Placement が作られないため page-ads は空を返し RagAds は自動的に collapse する（表示側の追加ゲート不要）。
 */
export function adsActiveFor(key: string): boolean {
  const mode = (process.env.ADS_ROLLOUT ?? 'off').trim();
  if (mode === 'off' || !key) return false;
  if (mode === 'on' || mode === '100') return true;
  if (mode === 'internal') {
    const allow = (process.env.ADS_INTERNAL_KEYS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return allow.includes(key);
  }
  const pct = parseInt(mode, 10);
  if (!Number.isFinite(pct) || pct <= 0) return false;
  // 安定ハッシュ（同一 key は常に同じ判定 = ユーザー体験が一貫）
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % 100 < pct;
}
