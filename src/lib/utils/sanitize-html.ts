import DOMPurify from 'dompurify';

/**
 * 外部コンテンツの HTML をサニタイズする
 *
 * XSS 攻撃を防止しつつ、記事コンテンツの表示に必要な
 * 安全な HTML タグ・属性のみを許可する。
 *
 * 許可するタグ:
 *   - テキスト: p, br, strong, em, b, i, u, s, sub, sup, span
 *   - 見出し: h1-h6
 *   - リスト: ul, ol, li
 *   - テーブル: table, thead, tbody, tr, th, td
 *   - メディア: img, figure, figcaption
 *   - リンク: a (target="_blank", rel="noopener noreferrer" を強制)
 *   - 構造: div, section, blockquote, pre, code, hr
 *
 * 禁止するタグ:
 *   - script, iframe, object, embed, form, input, textarea, select, button
 *   - style (インラインスタイルは属性として許可、<style> タグは禁止)
 *   - on* イベントハンドラー (onclick, onerror 等) は全て除去
 */
export function sanitizeArticleHtml(dirtyHtml: string): string {
  if (!dirtyHtml) return '';

  const clean = DOMPurify.sanitize(dirtyHtml, {
    ALLOWED_TAGS: [
      // テキスト
      'p',
      'br',
      'strong',
      'em',
      'b',
      'i',
      'u',
      's',
      'sub',
      'sup',
      'span',
      // 見出し
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      // リスト
      'ul',
      'ol',
      'li',
      // テーブル
      'table',
      'thead',
      'tbody',
      'tfoot',
      'tr',
      'th',
      'td',
      'caption',
      'colgroup',
      'col',
      // メディア
      'img',
      'figure',
      'figcaption',
      // リンク
      'a',
      // 構造
      'div',
      'section',
      'article',
      'blockquote',
      'pre',
      'code',
      'hr',
    ],
    ALLOWED_ATTR: [
      // 共通
      'class',
      'id',
      'style',
      // リンク
      'href',
      'target',
      'rel',
      'title',
      // 画像
      'src',
      'alt',
      'width',
      'height',
      'loading',
      // テーブル
      'colspan',
      'rowspan',
      'scope',
    ],
    // リンクを新しいタブで開く設定を強制
    ADD_ATTR: ['target'],
    // JavaScript URL を禁止 (javascript:, data: URI からのスクリプト実行)
    ALLOW_DATA_ATTR: false,
    // <a> タグに rel="noopener noreferrer" を自動付与するフック
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  });

  // サニタイズ後に <a> タグに安全属性を付与
  return clean
    .replace(
      /<a\s/g,
      '<a target="_blank" rel="noopener noreferrer" ',
    )
    .replace(
      /target="_blank"\s*target="_blank"/g,
      'target="_blank"',
    );
}
