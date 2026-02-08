/**
 * DynamoDB バックフィルスクリプト (重複排除機能付き)
 *
 * S3 に既存の prna/items/ 配下の記事データを DynamoDB に一括投入する。
 * タイトルベースの重複排除により、同一内容の記事は 1 件のみ格納する。
 *
 * 実行方法:
 *   npx tsx scripts/backfill-dynamodb.ts
 *
 * 環境変数:
 *   AWS_REGION (default: ap-northeast-1)
 *   AWS_S3_BUCKET_NAME (default: newfan-finance)
 *   DYNAMODB_TABLE_NAME (default: prna-articles)
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 */

import 'dotenv/config';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { createHash } from 'crypto';

// ===== Configuration =====
const BUCKET = process.env.AWS_S3_BUCKET_NAME || 'newfan-finance';
const PREFIX = 'prna/items/';
const TABLE = process.env.DYNAMODB_TABLE_NAME || 'prna-articles';
const REGION = process.env.AWS_REGION || 'ap-northeast-1';
const BATCH_SIZE = 25; // DynamoDB BatchWriteItem の上限

// ===== ArticleItem (S3 JSON 形式) =====
interface ArticleItem {
  source: string;
  category: string;
  title: string;
  link: string;
  id: string;
  published: string;
  published_iso: string;
  summary: string;
  content_html: string | null;
  authors: string[];
}

// ===== ProcessedArticle (DynamoDB 形式) =====
interface ProcessedArticle {
  url_hash: string;
  title_hash: string;
  url: string;
  title: string;
  content: string;
  thumbnail: string;
  pubDate: string;
  pubDateEpoch: number;
  author: string;
  category: string;
  s3Key: string;
  createdAt: string;
  updatedAt: string;
  ttl: number;
}

// ===== Helper Functions =====

function generateUrlHash(url: string): string {
  const normalized = url.trim().replace(/\/$/, '').split('?')[0];
  return createHash('sha256').update(normalized).digest('hex');
}

function generateTitleHash(title: string): string {
  const normalized = title
    .trim()
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  return createHash('sha256').update(normalized).digest('hex');
}

function extractThumbnail(html: string): string {
  if (!html) return '';
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) {
    const url = imgMatch[1];
    if (!url.includes('/ad_placeholder')) return url;
  }
  const urlMatch = html.match(
    /https?:\/\/[^\s<>"']+\.(jpg|jpeg|png|gif|webp)/i,
  );
  return urlMatch ? urlMatch[0] : '';
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function processArticle(item: ArticleItem, s3Key: string): ProcessedArticle {
  const now = new Date().toISOString();
  const pubDate = item.published_iso || item.published || now;
  const pubDateEpoch = Math.floor(new Date(pubDate).getTime() / 1000);
  const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  const decodedTitle = decodeHtmlEntities(item.title);

  return {
    url_hash: generateUrlHash(item.link),
    title_hash: generateTitleHash(decodedTitle),
    url: item.link,
    title: decodedTitle,
    content: item.summary || item.content_html || '',
    thumbnail: extractThumbnail(item.summary || ''),
    pubDate,
    pubDateEpoch,
    author: item.authors?.[0] || 'PR Newswire',
    category: item.category,
    s3Key,
    createdAt: now,
    updatedAt: now,
    ttl,
  };
}

// ===== Main Backfill Function =====

async function backfill(): Promise<void> {
  console.log('='.repeat(60));
  console.log('DynamoDB Backfill Script (with deduplication)');
  console.log('='.repeat(60));
  console.log(`Bucket: ${BUCKET}`);
  console.log(`Prefix: ${PREFIX}`);
  console.log(`Table:  ${TABLE}`);
  console.log(`Region: ${REGION}`);
  console.log('='.repeat(60));

  const s3 = new S3Client({ region: REGION });
  const dynamo = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: REGION }),
  );

  // 重複排除用のインメモリ Set (title_hash で追跡)
  const seenTitleHashes = new Set<string>();
  // url_hash の重複排除 (同一 URL は 1 回のみ)
  const seenUrlHashes = new Set<string>();

  let continuationToken: string | undefined;
  let totalProcessed = 0;
  let totalErrors = 0;
  let totalSkipped = 0;
  let totalDuplicates = 0;

  do {
    const listResponse = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: PREFIX,
        ContinuationToken: continuationToken,
      }),
    );

    const jsonFiles = (listResponse.Contents || []).filter((obj) =>
      obj.Key?.endsWith('.json'),
    );

    if (jsonFiles.length === 0) {
      console.log('No JSON files found in current batch.');
      continuationToken = listResponse.NextContinuationToken;
      continue;
    }

    console.log(`\nProcessing batch: ${jsonFiles.length} JSON files`);

    const batch: ProcessedArticle[] = [];

    for (const obj of jsonFiles) {
      if (!obj.Key) continue;

      try {
        const response = await s3.send(
          new GetObjectCommand({ Bucket: BUCKET, Key: obj.Key }),
        );
        const content = await response.Body?.transformToString();
        if (!content) {
          totalSkipped++;
          continue;
        }

        const articleItem: ArticleItem = JSON.parse(content);

        // link が空の記事はスキップ
        if (!articleItem.link || articleItem.link.trim() === '') {
          totalSkipped++;
          continue;
        }

        const processed = processArticle(articleItem, obj.Key);

        // URL 重複チェック
        if (seenUrlHashes.has(processed.url_hash)) {
          totalDuplicates++;
          continue;
        }

        // タイトル重複チェック (コンテンツベースの重複排除)
        if (seenTitleHashes.has(processed.title_hash)) {
          totalDuplicates++;
          continue;
        }

        seenUrlHashes.add(processed.url_hash);
        seenTitleHashes.add(processed.title_hash);
        batch.push(processed);

        if (batch.length >= BATCH_SIZE) {
          await writeBatch(dynamo, batch.splice(0, BATCH_SIZE));
          totalProcessed += BATCH_SIZE;
          process.stdout.write(
            `\rProcessed: ${totalProcessed} | Duplicates skipped: ${totalDuplicates}`,
          );
        }
      } catch (error) {
        console.error(`\nError processing ${obj.Key}:`, error);
        totalErrors++;
      }
    }

    // 残りのバッチを書き込み
    if (batch.length > 0) {
      await writeBatch(dynamo, batch);
      totalProcessed += batch.length;
      process.stdout.write(
        `\rProcessed: ${totalProcessed} | Duplicates skipped: ${totalDuplicates}`,
      );
    }

    continuationToken = listResponse.NextContinuationToken;
  } while (continuationToken);

  console.log('\n');
  console.log('='.repeat(60));
  console.log('Backfill Complete');
  console.log('='.repeat(60));
  console.log(`Total processed (unique): ${totalProcessed}`);
  console.log(`Total duplicates skipped: ${totalDuplicates}`);
  console.log(`Total errors:             ${totalErrors}`);
  console.log(`Total skipped (empty):    ${totalSkipped}`);
  console.log(`Unique title hashes:      ${seenTitleHashes.size}`);
  console.log(`Unique URL hashes:        ${seenUrlHashes.size}`);
  console.log('='.repeat(60));
}

/**
 * DynamoDB にバッチ書き込み
 */
async function writeBatch(
  dynamo: DynamoDBDocumentClient,
  items: ProcessedArticle[],
): Promise<void> {
  // バッチ内での url_hash 重複排除 (DynamoDB BatchWriteItem はキー重複を許さない)
  const uniqueItems = new Map<string, ProcessedArticle>();
  for (const item of items) {
    if (!uniqueItems.has(item.url_hash)) {
      uniqueItems.set(item.url_hash, item);
    }
  }

  const deduped = Array.from(uniqueItems.values());
  if (deduped.length === 0) return;

  const command = new BatchWriteCommand({
    RequestItems: {
      [TABLE]: deduped.map((item) => ({
        PutRequest: { Item: item },
      })),
    },
  });

  try {
    const response = await dynamo.send(command);

    if (
      response.UnprocessedItems &&
      Object.keys(response.UnprocessedItems).length > 0
    ) {
      console.warn(
        `\nRetrying ${Object.keys(response.UnprocessedItems).length} unprocessed items`,
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const retryCommand = new BatchWriteCommand({
        RequestItems: response.UnprocessedItems,
      });
      await dynamo.send(retryCommand);
    }
  } catch (error) {
    console.error('\nBatch write error:', error);
    throw error;
  }
}

// ===== Execute =====
backfill().catch((error) => {
  console.error('Fatal error during backfill:', error);
  process.exit(1);
});
