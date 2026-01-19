/**
 * セッションID管理ユーティリティ
 * ブラウザのlocalStorageを使用してユーザーごとのセッションIDを管理
 */

const SESSION_ID_KEY = 'newfan_session_id';

/**
 * セッションIDを取得または生成
 * localStorageに保存されたセッションIDを返す。存在しない場合は新規生成
 */
export function getSessionId(): string {
  if (typeof window === 'undefined') {
    // サーバーサイドでは空文字列を返す（クライアント側で生成される）
    return '';
  }

  let sessionId = localStorage.getItem(SESSION_ID_KEY);

  if (!sessionId) {
    // セッションIDを生成（UUID v4形式）
    sessionId = generateSessionId();
    localStorage.setItem(SESSION_ID_KEY, sessionId);
  }

  return sessionId;
}

/**
 * セッションIDを生成
 * UUID v4形式のランダムなIDを生成
 */
function generateSessionId(): string {
  // UUID v4形式のIDを生成
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * セッションIDをリセット
 * 新しいセッションIDを生成して保存
 */
export function resetSessionId(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  const newSessionId = generateSessionId();
  localStorage.setItem(SESSION_ID_KEY, newSessionId);
  return newSessionId;
}

/**
 * セッションIDを削除
 */
export function clearSessionId(): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem(SESSION_ID_KEY);
}
