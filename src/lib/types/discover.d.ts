export interface Discover {
  title: string;
  content: string;
  url: string;
  thumbnail: string;
  pubDate: string;
  author: string;
  category?: string; // トピックフィルタリング用（オプショナル）
}
