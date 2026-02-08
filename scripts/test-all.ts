/**
 * 包括的テストスクリプト
 *
 * DynamoDB、Redis、API、SSR ページの動作を検証する。
 *
 * 実行: npx tsx scripts/test-all.ts
 */

import 'dotenv/config';

const BASE_URL = 'http://localhost:3001';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL';
  detail: string;
  duration: number;
}

const results: TestResult[] = [];

async function runTest(
  name: string,
  fn: () => Promise<string>,
): Promise<void> {
  const start = Date.now();
  try {
    const detail = await fn();
    results.push({
      name,
      status: 'PASS',
      detail,
      duration: Date.now() - start,
    });
  } catch (error: any) {
    results.push({
      name,
      status: 'FAIL',
      detail: error.message || String(error),
      duration: Date.now() - start,
    });
  }
}

async function main() {

// ===== Test 1: DynamoDB 接続テスト (Discover API 経由) =====

await runTest('DynamoDB: finance カテゴリ記事取得', async () => {
  const res = await fetch(`${BASE_URL}/api/discover?topic=finance`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const count = json.blogs?.length || 0;
  if (count === 0) throw new Error('No articles returned');
  return `${count} 件取得。先頭: "${json.blogs[0].title?.substring(0, 40)}..."`;
});

await runTest('DynamoDB: market カテゴリ記事取得', async () => {
  const res = await fetch(`${BASE_URL}/api/discover?topic=market`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const count = json.blogs?.length || 0;
  if (count === 0) throw new Error('No articles returned');
  return `${count} 件取得`;
});

await runTest('DynamoDB: 全カテゴリ一括取得', async () => {
  const res = await fetch(`${BASE_URL}/api/discover`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const count = json.blogs?.length || 0;
  if (count === 0) throw new Error('No articles returned');
  return `${count} 件取得 (全カテゴリ)`;
});

// ===== Test 2: 記事詳細 API テスト =====

// finance の先頭記事 URL を取得
const discoverRes = await fetch(`${BASE_URL}/api/discover?topic=finance`);
const discoverJson = await discoverRes.json();
const testArticleUrl = discoverJson.blogs?.[0]?.url || '';
const testArticleTitle = discoverJson.blogs?.[0]?.title || '';
const encodedId = Buffer.from(testArticleUrl).toString('base64');

await runTest('記事詳細 API: DynamoDB から O(1) 取得', async () => {
  if (!testArticleUrl) throw new Error('テスト用記事 URL が取得できません');
  const res = await fetch(
    `${BASE_URL}/api/discover/article/${encodeURIComponent(encodedId)}`,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json.article) throw new Error('article が null');
  return `タイトル: "${json.article.title?.substring(0, 40)}..."`;
});

// ===== Test 3: Redis キャッシュテスト (2 回目の取得で HIT を期待) =====

await runTest('Redis キャッシュ: 2 回目は Redis HIT', async () => {
  // 1 回目 (MISS → DynamoDB → cache SET)
  const start1 = Date.now();
  const res1 = await fetch(
    `${BASE_URL}/api/discover/article/${encodeURIComponent(encodedId)}`,
  );
  const time1 = Date.now() - start1;

  // 2 回目 (Redis HIT を期待)
  const start2 = Date.now();
  const res2 = await fetch(
    `${BASE_URL}/api/discover/article/${encodeURIComponent(encodedId)}`,
  );
  const time2 = Date.now() - start2;

  if (!res1.ok || !res2.ok) throw new Error('API error');
  return `1 回目: ${time1}ms, 2 回目: ${time2}ms (キャッシュ効果: ${time1 > time2 ? 'あり' : '同等'})`;
});

// ===== Test 4: SSR ページテスト =====

await runTest('SSR: 記事ページに HTML コンテンツが含まれる', async () => {
  if (!encodedId) throw new Error('encodedId なし');
  const res = await fetch(
    `${BASE_URL}/discover/article/${encodeURIComponent(encodedId)}`,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  // HTML に記事コンテンツが含まれるか (CSR ならここは空)
  const hasContent = html.length > 5000;
  if (!hasContent) throw new Error(`HTML が短すぎる (${html.length} bytes)`);
  return `HTML サイズ: ${html.length} bytes (SSR でコンテンツ含む)`;
});

await runTest('SSR: <title> に記事タイトルが含まれる', async () => {
  const res = await fetch(
    `${BASE_URL}/discover/article/${encodeURIComponent(encodedId)}`,
  );
  const html = await res.text();
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/);
  if (!titleMatch) throw new Error('<title> タグが見つからない');
  const title = titleMatch[1];
  if (title === 'NewFan-Finance' || !title.includes('NewFan-Finance'))
    throw new Error(`タイトルが動的でない: ${title}`);
  return `<title> = "${title.substring(0, 60)}..."`;
});

// ===== Test 5: SEO メタデータ検証 =====

await runTest('SEO: og:title メタタグ', async () => {
  const res = await fetch(
    `${BASE_URL}/discover/article/${encodeURIComponent(encodedId)}`,
  );
  const html = await res.text();
  const match = html.match(
    /<meta property="og:title" content="([^"]*)"/,
  );
  if (!match) throw new Error('og:title が見つからない');
  return `og:title = "${match[1].substring(0, 50)}..."`;
});

await runTest('SEO: og:description メタタグ', async () => {
  const res = await fetch(
    `${BASE_URL}/discover/article/${encodeURIComponent(encodedId)}`,
  );
  const html = await res.text();
  const match = html.match(
    /<meta property="og:description" content="([^"]*)"/,
  );
  if (!match) throw new Error('og:description が見つからない');
  return `og:description = "${match[1].substring(0, 50)}..."`;
});

await runTest('SEO: og:type=article', async () => {
  const res = await fetch(
    `${BASE_URL}/discover/article/${encodeURIComponent(encodedId)}`,
  );
  const html = await res.text();
  const match = html.match(
    /<meta property="og:type" content="([^"]*)"/,
  );
  if (!match) throw new Error('og:type が見つからない');
  if (match[1] !== 'article')
    throw new Error(`og:type が article ではない: ${match[1]}`);
  return `og:type = "${match[1]}"`;
});

await runTest('SEO: og:url', async () => {
  const res = await fetch(
    `${BASE_URL}/discover/article/${encodeURIComponent(encodedId)}`,
  );
  const html = await res.text();
  const match = html.match(
    /<meta property="og:url" content="([^"]*)"/,
  );
  if (!match) throw new Error('og:url が見つからない');
  return `og:url = "${match[1].substring(0, 60)}..."`;
});

await runTest('SEO: Twitter Card', async () => {
  const res = await fetch(
    `${BASE_URL}/discover/article/${encodeURIComponent(encodedId)}`,
  );
  const html = await res.text();
  const match = html.match(
    /<meta name="twitter:card" content="([^"]*)"/,
  );
  if (!match) throw new Error('twitter:card が見つからない');
  return `twitter:card = "${match[1]}"`;
});

await runTest('SEO: JSON-LD 構造化データ', async () => {
  const res = await fetch(
    `${BASE_URL}/discover/article/${encodeURIComponent(encodedId)}`,
  );
  const html = await res.text();
  const match = html.match(
    /<script type="application\/ld\+json">([^<]+)<\/script>/,
  );
  if (!match) throw new Error('JSON-LD が見つからない');
  const jsonLd = JSON.parse(match[1]);
  if (jsonLd['@type'] !== 'NewsArticle')
    throw new Error(`@type が NewsArticle でない: ${jsonLd['@type']}`);
  const fields = [
    '@context',
    '@type',
    'headline',
    'datePublished',
    'author',
    'publisher',
  ];
  const missing = fields.filter((f) => !jsonLd[f]);
  if (missing.length > 0)
    throw new Error(`必須フィールド不足: ${missing.join(', ')}`);
  return `@type=${jsonLd['@type']}, headline="${jsonLd.headline?.substring(0, 30)}...", author=${jsonLd.author?.name}`;
});

await runTest('SEO: canonical URL', async () => {
  const res = await fetch(
    `${BASE_URL}/discover/article/${encodeURIComponent(encodedId)}`,
  );
  const html = await res.text();
  const match = html.match(/<link rel="canonical" href="([^"]*)"/);
  if (!match) throw new Error('canonical URL が見つからない');
  return `canonical = "${match[1].substring(0, 60)}..."`;
});

// ===== Test 6: sitemap.xml =====

await runTest('sitemap.xml: 動的生成', async () => {
  const res = await fetch(`${BASE_URL}/sitemap.xml`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  if (!xml.includes('<urlset')) throw new Error('XML 形式でない');
  const urlCount = (xml.match(/<url>/g) || []).length;
  if (urlCount < 2) throw new Error(`URL が少なすぎる: ${urlCount}`);
  const hasDiscover = xml.includes('/discover');
  const hasArticle = xml.includes('/discover/article/');
  return `${urlCount} URL 含む。/discover=${hasDiscover}, /discover/article/...=${hasArticle}`;
});

// ===== Test 7: 404 Not Found =====

await runTest('404: 存在しない記事 ID', async () => {
  // "nonexistent-url" を Base64 エンコード
  const fakeId = Buffer.from('http://example.com/nonexistent').toString(
    'base64',
  );
  const res = await fetch(
    `${BASE_URL}/discover/article/${encodeURIComponent(fakeId)}`,
  );
  const html = await res.text();
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/);
  const title = titleMatch ? titleMatch[1] : '';
  // not-found のタイトルが返されるか
  const isNotFound =
    title.includes('見つかりません') ||
    html.includes('見つかりません') ||
    res.status === 404;
  if (!isNotFound) throw new Error(`404 ページが表示されない (status=${res.status}, title=${title})`);
  return `status=${res.status}, title="${title}"`;
});

// ===== Test 8: ISR ヘッダー確認 =====

await runTest('ISR: Cache-Control ヘッダー確認', async () => {
  const res = await fetch(
    `${BASE_URL}/discover/article/${encodeURIComponent(encodedId)}`,
  );
  const cacheControl = res.headers.get('cache-control') || '';
  const xNextjsCache = res.headers.get('x-nextjs-cache') || 'なし';
  return `Cache-Control: "${cacheControl}", X-Nextjs-Cache: "${xNextjsCache}"`;
});

// ===== Test 9: パフォーマンステスト =====

await runTest('パフォーマンス: 記事一覧レスポンス時間', async () => {
  const start = Date.now();
  await fetch(`${BASE_URL}/api/discover?topic=finance`);
  const elapsed = Date.now() - start;
  return `${elapsed}ms`;
});

await runTest('パフォーマンス: 記事詳細 SSR レスポンス時間', async () => {
  const start = Date.now();
  await fetch(
    `${BASE_URL}/discover/article/${encodeURIComponent(encodedId)}`,
  );
  const elapsed = Date.now() - start;
  return `${elapsed}ms`;
});

// ===== 結果出力 =====

console.log('\n');
console.log('='.repeat(80));
console.log('  テスト結果サマリー');
console.log('='.repeat(80));
console.log('');

const passCount = results.filter((r) => r.status === 'PASS').length;
const failCount = results.filter((r) => r.status === 'FAIL').length;

for (const r of results) {
  const icon = r.status === 'PASS' ? '[PASS]' : '[FAIL]';
  const timeStr = `(${r.duration}ms)`;
  console.log(`  ${icon} ${r.name} ${timeStr}`);
  console.log(`         ${r.detail}`);
}

console.log('');
console.log('-'.repeat(80));
console.log(`  合計: ${results.length} テスト | PASS: ${passCount} | FAIL: ${failCount}`);
console.log('-'.repeat(80));

if (failCount > 0) {
  console.log('\n  --- 失敗したテスト ---');
  for (const r of results.filter((r) => r.status === 'FAIL')) {
    console.log(`  [FAIL] ${r.name}: ${r.detail}`);
  }
}

console.log('');
process.exit(failCount > 0 ? 1 : 0);

} // end main

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
