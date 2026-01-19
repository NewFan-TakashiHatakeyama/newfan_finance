import { RSSItem } from './rss-parser';
import he from 'he'; // HTMLエンティティのデコード用

export interface ArticleMetadata {
  title: string;
  content: string;
  url: string;
  thumbnail: string;
  pubDate: string;
  author: string;
  categories: string[];
  _source_uri?: string;
  _s3_key?: string;
}

/**
 * RSSアイテムを記事メタデータに変換
 */
export function convertRSSItemToArticle(
  item: RSSItem,
  s3Key: string
): ArticleMetadata {
  // HTMLタグを除去してテキストのみ抽出（簡易版）
  const stripHtml = (html: string): string => {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();
  };

  // 画像URLを抽出
  const extractImageUrl = (description: string): string => {
    const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i);
    return imgMatch ? imgMatch[1] : '';
  };

  // HTMLエンティティをデコード
  const decodedTitle = he.decode(item.title);
  const decodedDescription = he.decode(item.description);

  return {
    title: decodedTitle,
    content: stripHtml(decodedDescription),
    url: item.link,
    thumbnail: item.enclosure?.url || extractImageUrl(item.description) || '',
    pubDate: item.pubDate,
    author: item.author || 'PR Newswire',
    categories: item.category || [],
    _source_uri: item.guid,
    _s3_key: s3Key,
  };
}
