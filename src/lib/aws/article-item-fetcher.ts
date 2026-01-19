import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { s3Client } from './s3-client';
import { withRetry } from './s3-retry';
import { handleS3Error } from './s3-error-handler';

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || '';
const ITEMS_PREFIX = 'prna/items';

if (!BUCKET_NAME) {
  console.warn('[Article Item Fetcher] AWS_S3_BUCKET_NAME is not set. S3 operations will fail.');
}

export interface ArticleItem {
  source: string;
  category: string;
  title: string;
  link: string;
  id: string;
  published: string;
  published_iso: string;
  summary: string; // HTMLコンテンツ
  content_html: string | null;
  authors: string[];
}

/**
 * 日付形式: YYYY-MM-DD
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * 記事URLから記事ID（ハッシュ）を抽出して、S3キーを生成
 * パス構造: prna/items/{date}/{topic}/{hash}.json
 */
function generateS3KeyFromUrl(url: string, date?: string): string[] {
  const dateStr = date || formatDate(new Date());
  const topics = ['capital', 'english', 'finance', 'market', 'prnewswire', 'real_estate', 'special'];
  
  // URLから記事IDを抽出（例: 4863706_JA63706_3）
  const urlMatch = url.match(/\/(\d+_[A-Z]+\d+_\d+)$/);
  if (!urlMatch) {
    return [];
  }
  
  const articleId = urlMatch[1];
  const possibleKeys: string[] = [];
  
  // 各トピックでS3キーを生成
  for (const topic of topics) {
    // ハッシュは実際のファイル名から取得する必要があるため、
    // ここではリスト操作で検索する必要がある
    // 一時的に、すべてのトピックのパスを返す
    possibleKeys.push(`${ITEMS_PREFIX}/${dateStr}/${topic}/`);
  }
  
  return possibleKeys;
}

/**
 * S3から記事JSONファイルを取得
 * URLから記事を検索して、該当するJSONファイルを取得
 */
export async function fetchArticleItemFromS3(url: string, date?: string): Promise<ArticleItem | null> {
  if (!BUCKET_NAME) {
    throw new Error('AWS_S3_BUCKET_NAME environment variable is not set');
  }

  const dateStr = date || formatDate(new Date());
  const topics = ['capital', 'english', 'finance', 'market', 'prnewswire', 'real_estate', 'special'];
  
  // URLを正規化
  const normalizedUrl = url.trim().replace(/\/$/, '').split('?')[0];
  
  // 各トピックのディレクトリを検索
  for (const topic of topics) {
    const prefix = `${ITEMS_PREFIX}/${dateStr}/${topic}/`;
    
    try {
      // まず、ListObjectsV2でJSONファイルをリストアップ
      const listCommand = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        MaxKeys: 1000,
      });
      
      const listResponse = await withRetry(async () => {
        return await s3Client.send(listCommand);
      });
      
      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        continue;
      }
      
      // 各JSONファイルを読み込んで、URLが一致するものを探す
      for (const object of listResponse.Contents) {
        if (!object.Key || !object.Key.endsWith('.json')) {
          continue;
        }
        
        try {
          const getCommand = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: object.Key,
          });
          
          const getResponse = await withRetry(async () => {
            return await s3Client.send(getCommand);
          });
          
          const jsonContent = await getResponse.Body?.transformToString();
          if (!jsonContent) continue;
          
          const articleItem: ArticleItem = JSON.parse(jsonContent);
          
      // URLが一致するか確認（正規化して比較）
      const articleUrl = articleItem.link?.trim().replace(/\/$/, '').split('?')[0];
      
      // 完全一致を試す
      if (articleUrl === normalizedUrl) {
        console.log(`Found exact match: ${articleUrl}`);
        return articleItem;
      }
      
      // 部分一致も試す（末尾の数字が異なる場合）
      const extractArticleId = (url: string): string | null => {
        const match = url.match(/(\d+_[A-Z]+\d+_\d+)$/);
        return match ? match[1] : null;
      };
      
      const searchId = extractArticleId(normalizedUrl);
      const articleId = extractArticleId(articleUrl || '');
      
      if (searchId && articleId) {
        // 末尾の数字を除いた部分で比較
        const searchIdBase = searchId.replace(/_\d+$/, '');
        const articleIdBase = articleId.replace(/_\d+$/, '');
        
        if (searchIdBase === articleIdBase) {
          console.log(`Found partial match: ${articleUrl} (searching for: ${normalizedUrl})`);
          return articleItem;
        }
      }
        } catch (error) {
          console.error(`Error processing ${object.Key}:`, error);
          continue;
        }
      }
    } catch (error: any) {
      // エラーが発生しても次のトピックを試す
      if (error.name === 'AccessDenied') {
        console.error(`Access denied for prefix ${prefix}`);
      }
      continue;
    }
  }
  
  return null;
}
