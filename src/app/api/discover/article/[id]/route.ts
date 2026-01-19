import { NextRequest, NextResponse } from 'next/server';
import { fetchArticleItemFromS3 } from '@/lib/aws/article-item-fetcher';
import { handleS3Error } from '@/lib/aws/s3-error-handler';

/**
 * 記事詳細ページ用のAPIエンドポイント
 * URLパラメータから記事URLを取得し、S3からJSONファイルを取得
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log('API route called: /api/discover/article/[id]');
  console.log('Request URL:', request.url);
  
  try {
    const resolvedParams = await params;
    let articleId = resolvedParams.id;
    
    console.log('Received article ID from params:', articleId);
    
    // もしparamsから取得できない場合、URLから直接抽出
    if (!articleId) {
      const url = new URL(request.url);
      const pathParts = url.pathname.split('/');
      const idIndex = pathParts.indexOf('article') + 1;
      if (idIndex > 0 && idIndex < pathParts.length) {
        articleId = pathParts[idIndex];
        console.log('Extracted article ID from URL path:', articleId);
      }
    }
    
    if (!articleId) {
      return NextResponse.json(
        { error: 'Article ID is required' },
        { status: 400 }
      );
    }
    
    // URLエンコードされた文字をデコード（%3D → =）
    // Next.jsは自動的にデコードするが、念のため明示的にデコード
    try {
      articleId = decodeURIComponent(articleId);
      console.log('Article ID after URI decode:', articleId);
    } catch (error) {
      // デコードに失敗した場合は元の文字列を使用
      console.warn('Failed to decode URI component, using original:', error);
    }
    
    // Base64エンコードされたURLをデコード
    let decodedUrl: string;
    try {
      // Base64文字列のパディング（=）を補完
      // Base64文字列の長さが4の倍数でない場合、=でパディング
      let base64String = articleId;
      while (base64String.length % 4 !== 0) {
        base64String += '=';
      }
      decodedUrl = Buffer.from(base64String, 'base64').toString('utf-8');
      console.log('Decoded URL from Base64:', decodedUrl);
    } catch (error) {
      // Base64デコードに失敗した場合
      console.error('Failed to decode Base64:', error);
      return NextResponse.json(
        { error: 'Invalid article ID format' },
        { status: 400 }
      );
    }
    
    // 今日の日付と過去数日分を試す（記事が古い場合に備えて）
    const datesToTry: string[] = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      datesToTry.push(date.toISOString().split('T')[0]);
    }
    
    let articleItem = null;
    
    // 各日付で試す
    for (const date of datesToTry) {
      try {
        console.log(`Trying to fetch article for date: ${date}`);
        articleItem = await fetchArticleItemFromS3(decodedUrl, date);
        if (articleItem) {
          console.log(`Article found for date: ${date}`);
          break;
        } else {
          console.log(`Article not found for date: ${date}`);
        }
      } catch (error: any) {
        console.error(`Error fetching article for date ${date}:`, error);
        // AccessDeniedエラーの場合は権限の問題
        if (error.name === 'AccessDenied') {
          console.error(`Access denied - IAM policy may need to be updated for prna/items/`);
        }
        continue;
      }
    }
    
    if (!articleItem) {
      return NextResponse.json(
        { error: 'Article not found' },
        { status: 404 }
      );
    }
    
    // 記事データを返す
    return NextResponse.json(
      {
        article: {
          title: articleItem.title,
          content: articleItem.summary || articleItem.content_html || '', // HTMLコンテンツ
          url: articleItem.link,
          thumbnail: extractThumbnailFromHtml(articleItem.summary || ''),
          pubDate: articleItem.published,
          author: articleItem.authors?.[0] || 'PR Newswire',
          category: articleItem.category,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const { message, statusCode } = handleS3Error(error);
    console.error('Error fetching article from S3:', error);
    return NextResponse.json(
      { error: message || 'An error occurred' },
      { status: statusCode || 500 }
    );
  }
}

/**
 * HTMLコンテンツからサムネイル画像URLを抽出
 */
function extractThumbnailFromHtml(html: string): string {
  // imgタグから画像URLを抽出
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) {
    return imgMatch[1];
  }
  
  // enclosureやその他の画像参照を探す
  const urlMatch = html.match(/https?:\/\/[^\s<>"']+\.(jpg|jpeg|png|gif|webp)/i);
  if (urlMatch) {
    return urlMatch[0];
  }
  
  return '';
}
