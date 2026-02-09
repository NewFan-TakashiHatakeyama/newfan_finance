import sanitize from 'sanitize-html';

/**
 * 外部コンテンツの HTML をサニタイズする
 *
 * XSS 攻撃を防止しつつ、記事コンテンツの表示に必要な
 * 安全な HTML タグ・属性のみを許可する。
 *
 * sanitize-html は純粋な JS 実装のため、
 * Node.js (SSR) / ブラウザ / Vercel Serverless のいずれでも動作する。
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

  return sanitize(dirtyHtml, {
    allowedTags: [
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
    allowedAttributes: {
      // 共通 (全タグ)
      '*': ['class', 'id', 'style'],
      // リンク
      a: ['href', 'target', 'rel', 'title'],
      // 画像
      img: ['src', 'alt', 'width', 'height', 'loading'],
      // テーブル
      th: ['colspan', 'rowspan', 'scope'],
      td: ['colspan', 'rowspan'],
    },
    // JavaScript URL を禁止
    allowedSchemes: ['http', 'https', 'mailto'],
    // <a> タグに安全属性を強制付与
    transformTags: {
      a: (tagName: string, attribs: sanitize.Attributes) => {
        return {
          tagName,
          attribs: {
            ...attribs,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
        };
      },
    },
  });
}
