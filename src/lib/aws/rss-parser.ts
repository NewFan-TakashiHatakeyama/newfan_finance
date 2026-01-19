import { XMLParser } from 'fast-xml-parser';

export interface RSSItem {
  guid: string;
  title: string;
  description: string;
  link: string;
  author: string;
  category: string[];
  enclosure?: {
    url: string;
    type: string;
  };
  pubDate: string;
  source?: {
    url: string;
    '#text': string;
  };
}

export interface ParsedRSS {
  title: string;
  description: string;
  link: string;
  items: RSSItem[];
}

/**
 * RSS XMLをパースして構造化データに変換
 */
export function parseRSS(xmlContent: string): ParsedRSS {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    textNodeName: '#text',
    parseAttributeValue: true,
    trimValues: true,
  });

  const parsed = parser.parse(xmlContent);
  const channel = parsed.rss?.channel || parsed.feed;

  if (!channel) {
    throw new Error('Invalid RSS format: channel not found');
  }

  const items = Array.isArray(channel.item) ? channel.item : [channel.item].filter(Boolean);

  return {
    title: channel.title?.['#text'] || channel.title || '',
    description: channel.description?.['#text'] || channel.description || '',
    link: channel.link?.['#text'] || channel.link || '',
    items: items.map((item: any) => ({
      guid: item.guid?.['#text'] || item.guid || item.link?.['#text'] || item.link || '',
      title: item.title?.['#text'] || item.title || '',
      description: item.description?.['#text'] || item.description || '',
      link: item.link?.['#text'] || item.link || '',
      author: item.author?.['#text'] || item.author || item['dc:creator']?.['#text'] || '',
      category: Array.isArray(item.category)
        ? item.category.map((c: any) => c['#text'] || c)
        : item.category
        ? [item.category['#text'] || item.category]
        : [],
      enclosure: item.enclosure
        ? {
            url: item.enclosure.url || '',
            type: item.enclosure.type || '',
          }
        : undefined,
      pubDate: item.pubDate?.['#text'] || item.pubDate || item['dc:date']?.['#text'] || '',
      source: item.source
        ? {
            url: item.source.url || '',
            '#text': item.source['#text'] || '',
          }
        : undefined,
    })),
  };
}
