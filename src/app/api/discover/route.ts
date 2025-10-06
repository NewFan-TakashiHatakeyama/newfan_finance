import Parser from 'rss-parser';

const rssFeedUrls: { [key: string]: string } = {
  finance: 'http://www.prnasia.com/m/mediafeed/rss?id=4231',
  market: 'http://www.prnasia.com/m/mediafeed/rss?id=4232',
  capital: 'http://www.prnasia.com/m/mediafeed/rss?id=4233',
  real_estate: 'http://www.prnasia.com/m/mediafeed/rss?id=4234',
  special: 'http://www.prnasia.com/m/mediafeed/rss?id=4235',
  prnewswire: 'http://www.prnasia.com/m/mediafeed/rss?id=3249',
};

const extractImageFromContent = (content: string): string => {
  const imgTagMatch = content.match(/<img[^>]+src="([^">]+)"/);
  return imgTagMatch ? imgTagMatch[1] : '';
};

const ensureAbsoluteUrl = (url: string, base: string): string => {
  if (!url) return '';
  try {
    return new URL(url, base).toString();
  } catch (e) {
    return '';
  }
};

export const GET = async (req: Request) => {
  try {
    const params = new URL(req.url).searchParams;
    const topic = params.get('topic') || 'finance';

    const feedUrl = rssFeedUrls[topic];
    if (!feedUrl) {
      return Response.json(
        { message: 'Invalid topic' },
        {
          status: 400,
        },
      );
    }

    const response = await fetch(feedUrl, { next: { revalidate: 900 } });
    if (!response.ok) {
      throw new Error(`Failed to fetch RSS feed: ${response.statusText}`);
    }
    const xmlText = await response.text();

    const parser = new Parser();
    const feed = await parser.parseString(xmlText);

    const blogs = feed.items
      .map((item) => {
        const baseUrl = item.link ? new URL(item.link).origin : '';
        let thumbnail = '';

        if (item.enclosure?.type?.startsWith('image/')) {
          thumbnail = item.enclosure.url;
        } else {
          thumbnail = extractImageFromContent(item.content || '');
        }

        thumbnail = ensureAbsoluteUrl(thumbnail, baseUrl);

        return {
          title: item.title || '',
          content: item.contentSnippet || item.content || '',
          url: item.link || '',
          thumbnail: thumbnail,
          pubDate: item.pubDate || '',
          author: item.author || '',
        };
      })
      .filter((item) => item.thumbnail);

    return Response.json(
      {
        blogs: blogs,
      },
      {
        status: 200,
      },
    );
  } catch (err) {
    console.error(`An error occurred in discover route: ${err}`);
    return Response.json(
      {
        message: 'An error has occurred',
      },
      {
        status: 500,
      },
    );
  }
};
