# AWS S3統合によるPRNAニュースフィード取得機能 実装ガイド

## 1. 概要

本ドキュメントは、AWS S3に格納されているPRNAニュースフィード情報を安全に取得するための実装ガイドです。セキュリティを最優先とし、最小権限の原則に基づいたIAMロール設定と実装方法を記載しています。

## 2. アーキテクチャ概要

本ガイドでは、**S3上のPRNAニュースフィード処理をAWS Lambdaで実装し、フロントエンドはVercel上のNext.jsアプリとして公開する構成を基本想定**とします。  
Next.js アプリケーション（Vercel）は、Lambdaが整形・保存したデータ（DB / キャッシュ）を参照する、もしくはAPI Gateway等を経由してLambdaへ間接アクセスします。

```
[AWS S3 Bucket: newfan-finance]
    ↓ (S3 Event Notifications)
[AWS Lambda (RSS解析 & メタデータ整形)]
    ↓
[Database / Cache（例: RDS, DynamoDB, OpenSearch, Redis など）]
    ↓
[Next.js Application on Vercel]
    ↓
[Next.js API Route / Server Components] ──→ [Database / Cache] を参照

※ オプションで S3 → SQS → Lambda 構成も選択可能
※ 本番環境では、Vercel から直接 S3 にアクセスせず、原則として Lambda / DB 経由とする
```

### 2.1 S3データ構造

S3バケット内のデータは以下の構造で格納されています：

```
newfan-finance/
└── prna/
    └── raw/
        ├── capital/
        │   └── {date}/
        │       └── {uuid}.xml
        ├── english/
        │   └── {date}/
        │       └── {uuid}.xml
        ├── finance/
        │   └── {date}/
        │       └── {uuid}.xml
        ├── market/
        │   └── {date}/
        │       └── {uuid}.xml
        ├── prnewswire/
        │   └── {date}/
        │       └── {uuid}.xml
        ├── real_estate/
        │   └── {date}/
        │       └── {uuid}.xml
        └── special/
            └── {date}/
                └── {uuid}.xml
```

**パス形式**: `prna/raw/{topic}/{date}/{uuid}.xml`

- **バケット名**: `newfan-finance`
- **ベースプレフィックス**: `prna/raw`
- **トピック**: `capital`, `english`, `finance`, `market`, `prnewswire`, `real_estate`, `special`
- **日付形式**: `YYYY-MM-DD`（例: `2025-11-10`）
- **ファイル形式**: XML (RSS 2.0)
- **ファイル名形式**: UUID形式（例: `61e84727-3eb7-4a68-843f-e25b4d83c3f4.xml`）

**実際のパス例**: `s3://newfan-finance/prna/raw/capital/2025-11-10/61e84727-3eb7-4a68-843f-e25b4d83c3f4.xml`

## 3. セキュリティ要件

### 3.1 IAMロール・ポリシーの設計原則

- **最小権限の原則**: 必要最小限の権限のみを付与
- **読み取り専用アクセス**: S3バケットからの読み取りのみ許可
- **特定バケット・プレフィックスへのアクセス制限**: PRNA記事のみにアクセス可能
- **認証情報の安全な管理**: 環境変数またはIAMロールを使用

### 3.2 必要な権限

以下の最小権限ポリシーを付与します。トピックフォルダ（`capital/`, `english/`, `finance/`, `market/`, `prnewswire/`, `real_estate/`, `special/`）へのアクセスのみを許可します：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowListBucket",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::newfan-finance",
      "Condition": {
        "StringLike": {
          "s3:prefix": [
            "prna/raw/capital/",
            "prna/raw/english/",
            "prna/raw/finance/",
            "prna/raw/market/",
            "prna/raw/prnewswire/",
            "prna/raw/real_estate/",
            "prna/raw/special/"
          ]
        }
      }
    },
    {
      "Sid": "AllowGetObject",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject"
      ],
      "Resource": [
        "arn:aws:s3:::newfan-finance/prna/raw/capital/*",
        "arn:aws:s3:::newfan-finance/prna/raw/english/*",
        "arn:aws:s3:::newfan-finance/prna/raw/finance/*",
        "arn:aws:s3:::newfan-finance/prna/raw/market/*",
        "arn:aws:s3:::newfan-finance/prna/raw/prnewswire/*",
        "arn:aws:s3:::newfan-finance/prna/raw/real_estate/*",
        "arn:aws:s3:::newfan-finance/prna/raw/special/*"
      ]
    }
  ]
}
```

**ポリシーの説明**:
- **ListBucket**: バケット内のオブジェクト一覧を取得（`prna/raw/`配下のトピックフォルダのみに制限）
- **GetObject**: オブジェクトの内容とメタデータを取得（`prna/raw/`配下のトピックフォルダ内のオブジェクトのみ）

## 4. 実装タスク

### タスク1: AWS S3バケットへの接続設定（IAMロール・認証情報管理）

#### 4.1.1 IAMポリシーの作成

まず、S3読み取り専用のIAMポリシーを作成します。

**手順**:

1. **AWS IAMコンソールにアクセス**
   - AWSマネジメントコンソールにログイン
   - サービス検索で「IAM」を検索して開く

2. **ポリシーの作成**
   - 左側メニューから「ポリシー」を選択
   - 「ポリシーを作成」ボタンをクリック

3. **JSONタブを選択して、以下のポリシーを貼り付け**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowListBucket",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::newfan-finance",
      "Condition": {
        "StringLike": {
          "s3:prefix": [
            "prna/raw/capital/",
            "prna/raw/english/",
            "prna/raw/finance/",
            "prna/raw/market/",
            "prna/raw/prnewswire/",
            "prna/raw/real_estate/",
            "prna/raw/special/"
          ]
        }
      }
    },
    {
      "Sid": "AllowGetObject",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject"
      ],
      "Resource": [
        "arn:aws:s3:::newfan-finance/prna/raw/capital/*",
        "arn:aws:s3:::newfan-finance/prna/raw/english/*",
        "arn:aws:s3:::newfan-finance/prna/raw/finance/*",
        "arn:aws:s3:::newfan-finance/prna/raw/market/*",
        "arn:aws:s3:::newfan-finance/prna/raw/prnewswire/*",
        "arn:aws:s3:::newfan-finance/prna/raw/real_estate/*",
        "arn:aws:s3:::newfan-finance/prna/raw/special/*"
      ]
    }
  ]
}
```

4. **ポリシーの詳細を設定**
   - 「次のステップ: タグ」をクリック（タグは任意）
   - 「次のステップ: 確認」をクリック
   - **ポリシー名**: `prna-news-readonly-policy`
   - **説明**: `PRNAニュース記事のS3バケット読み取り専用アクセス`
   - 「ポリシーを作成」をクリック

#### 4.1.2 IAMロールの作成

次に、作成したポリシーをアタッチするIAMロールを作成します。  
**本番構成では、Lambda 実行ロールとしての利用を基本とします**。

**手順**:

1. **IAMコンソールでロールを作成**
   - 左側メニューから「ロール」を選択
   - 「ロールを作成」ボタンをクリック

2. **信頼関係の設定**

   使用するサービスに応じて、以下のいずれかを選択します：

   **A. Lambda関数で使用する場合（基本構成・推奨）**:
   
   - 「信頼されたエンティティの種類」で「AWS のサービス」を選択
   - 「ユースケース」で「Lambda」を選択
   - 「次のステップ」をクリック

   **信頼関係ポリシー（自動生成されます）**:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": {
           "Service": "lambda.amazonaws.com"
         },
         "Action": "sts:AssumeRole"
       }
     ]
   }
   ```

   **B. ローカル開発環境で使用する場合（IAMユーザー経由）**:
   
   **方法1: IAMユーザーにロール引き受け権限を付与（推奨）**:
   
   - 「信頼されたエンティティの種類」で「AWS アカウント」を選択
   - 「このアカウント」を選択
   - 「次のステップ」をクリック

   **信頼関係ポリシー**:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": {
           "AWS": "arn:aws:iam::YOUR_ACCOUNT_ID:root"
         },
         "Action": "sts:AssumeRole"
       }
     ]
   }
   ```

   **IAMユーザーにロール引き受け権限を付与**:
   
   開発用IAMユーザーに以下のポリシーをアタッチ:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": "sts:AssumeRole",
         "Resource": "arn:aws:iam::YOUR_ACCOUNT_ID:role/prna-news-readonly-role"
       }
     ]
   }
   ```

   **方法2: IAMユーザーに直接ポリシーをアタッチ（簡易版）**:
   
   ローカル開発環境のみで使用する場合、IAMユーザーに直接 `prna-news-readonly-policy` をアタッチすることも可能です。ただし、本番環境では必ずLambda実行ロールを使用してください。

3. **ポリシーのアタッチ**
   - 「ポリシーを許可」の検索ボックスで「prna-news-readonly-policy」を検索
   - 作成したポリシーにチェックを入れる
   - 「次のステップ」をクリック

4. **ロールの詳細を設定**
   - **ロール名**: `prna-news-readonly-role`
   - **説明**: `PRNAニュース記事のS3バケット読み取り専用アクセス用ロール`
   - 「ロールを作成」をクリック

5. **ロールARNの確認**
   - 作成されたロールの詳細ページで、**ロールARN**をコピー
   - 例: `arn:aws:iam::123456789012:role/prna-news-readonly-role`
   - このARNは後で使用します

#### 4.1.3 ロールの使用方法

**A. Lambda関数での使用（基本構成・推奨）**:

1. Lambda関数を作成（例: `prna-rss-ingestor`）
2. 「実行ロール」で既存ロールから`prna-news-readonly-role`を選択  
   または、「新しいロールを作成」で本ガイドに従って作成したロールを選択
3. 必要に応じて CloudWatch Logs への出力権限（`AWSLambdaBasicExecutionRole` 相当）も別ポリシーで付与

Lambda 実行ロールには以下が付与されます:
- `prna-news-readonly-policy`（S3からの読み取り）
- `AWSLambdaBasicExecutionRole`（ログ出力用、マネージドポリシー）

**B. ローカル開発環境での使用（一時的な認証情報取得）**:

```bash
# AWS CLIで一時的な認証情報を取得
aws sts assume-role \
  --role-arn arn:aws:iam::YOUR_ACCOUNT_ID:role/prna-news-readonly-role \
  --role-session-name dev-session \
  --duration-seconds 3600
```

出力された認証情報を環境変数に設定:

```bash
export AWS_ACCESS_KEY_ID=<TemporaryAccessKeyId>
export AWS_SECRET_ACCESS_KEY=<TemporarySecretAccessKey>
export AWS_SESSION_TOKEN=<SessionToken>
```

**E. Docker Composeでの使用**:

Docker Composeを使用する場合、環境変数で認証情報を設定します。

`docker-compose.yaml`に環境変数を追加:

```yaml
services:
  app:
    environment:
      - AWS_REGION=ap-northeast-1
      - AWS_S3_BUCKET_NAME=newfan-finance
      - AWS_S3_PREFIX=prna/raw
      # ローカル開発環境のみ（IAMロールを使用できない場合）
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      # ロールを使用する場合は、上記2つは不要
```

`.env`ファイル（Docker Compose用）を作成:

```bash
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
```

**注意**: `.env`ファイルは`.gitignore`に追加してください。

**本番環境（Lambda）では、必ずLambda実行ロールを使用し、認証情報を環境変数に設定しないでください。**

#### 4.1.4 AWSアカウントIDの確認

IAMロールのARNを作成する際に、AWSアカウントIDが必要です。

**AWSアカウントIDの確認方法**:

1. **AWSコンソールから確認**:
   - 右上のユーザー名をクリック
   - 「アカウント」または「アカウントID」をクリック
   - 12桁の数字が表示されます

2. **AWS CLIで確認**:
   ```bash
   aws sts get-caller-identity --query Account --output text
   ```

3. **IAMコンソールから確認**:
   - IAMコンソールの右上に表示される12桁の数字

#### 4.1.5 ロールのテスト

作成したロールが正しく動作するかテストします。

**AWS CLIでのテスト**:

```bash
# ロールを引き受けてS3バケットをリスト
aws sts assume-role \
  --role-arn arn:aws:iam::YOUR_ACCOUNT_ID:role/prna-news-readonly-role \
  --role-session-name test-session \
  --query 'Credentials' \
  --output json > /tmp/creds.json

# 一時認証情報を設定
export AWS_ACCESS_KEY_ID=$(jq -r '.AccessKeyId' /tmp/creds.json)
export AWS_SECRET_ACCESS_KEY=$(jq -r '.SecretAccessKey' /tmp/creds.json)
export AWS_SESSION_TOKEN=$(jq -r '.SessionToken' /tmp/creds.json)

# S3バケットのリストを取得（financeトピックのみ）
aws s3 ls s3://newfan-finance/finance/ --recursive | head -5

# オブジェクトの取得テスト
aws s3 cp s3://newfan-finance/finance/2025-11-10/sample.xml /tmp/test.xml
```

**エラーが発生した場合の確認事項**:
- ロールの信頼関係ポリシーが正しく設定されているか
- ポリシーがロールにアタッチされているか
- S3バケット名が正しいか（`newfan-finance`）
- リージョンが正しいか

#### 4.1.2 認証情報の管理方法

**方法A: IAMロールを使用（推奨）**
- Lambda で実行する場合
- 実行ロールに必要なポリシーをアタッチするだけで、認証情報をコードや環境変数に含める必要なし

**方法B: 環境変数を使用（開発環境）**
- `.env.local`ファイルに認証情報を保存（Gitにコミットしない）
- `AWS_ACCESS_KEY_ID`と`AWS_SECRET_ACCESS_KEY`を設定
- 本番環境では使用しない

**実装例**:
```typescript
// src/lib/aws/s3-client.ts
import { S3Client } from '@aws-sdk/client-s3';

const getS3Client = (): S3Client => {
  // 環境変数から認証情報を取得（IAMロール使用時は不要）
  const config: any = {
    region: process.env.AWS_REGION || 'ap-northeast-1',
  };

  // IAMロールを使用する場合、認証情報は自動的に取得される
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }

  return new S3Client(config);
};

export const s3Client = getS3Client();
```

#### 4.1.3 環境変数の設定

`.env.local`（開発環境）:
```bash
AWS_REGION=ap-northeast-1
AWS_S3_BUCKET_NAME=newfan-finance
AWS_S3_PREFIX=
# 開発環境のみ（本番ではIAMロールを使用）
# AWS_ACCESS_KEY_ID=your-access-key
# AWS_SECRET_ACCESS_KEY=your-secret-key
```

**注意**: `AWS_S3_PREFIX`は`prna/raw`（実際のS3パス構造に合わせる）

### タスク2: S3に格納されているPRNAニュースフィード情報の取得API実装（Lambda / Next.js 両対応）

#### 4.2.1 必要なパッケージのインストール

```bash
npm install @aws-sdk/client-s3 @aws-sdk/lib-storage fast-xml-parser he
```

**パッケージ説明**:
- `@aws-sdk/client-s3`: AWS S3クライアント
- `@aws-sdk/lib-storage`: S3への大容量ファイルアップロード用（今回は使用しない）
- `fast-xml-parser`: RSS XMLファイルのパース用（高速なXMLパーサー）
- `he`: HTMLエンティティのデコード用（`&amp;` → `&` など）

#### 4.2.2 RSS XMLパーサーの実装

**ファイル**: `src/lib/aws/rss-parser.ts`

```typescript
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
```

#### 4.2.3 記事データ変換ユーティリティ

**ファイル**: `src/lib/aws/article-converter.ts`

```typescript
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
```

#### 4.2.4 API実装パターン

このセクションでは、**Lambdaベース実装**と**Next.js API Routeベース実装**の2パターンを示します。

##### パターンA: Lambdaでの実装（基本構成・推奨）

Lambda 関数内で S3 からRSSを取得し、解析・変換した結果をDB/検索基盤へ保存します。  
Next.js は DB/検索基盤を参照するだけにし、S3 への直接アクセスは Lambda に集約します。

（※ 4.5.1 の擬似コードを参照）

##### パターンB: Next.js API Routeでの実装（開発・検証用）

**ファイル**: `src/app/api/s3-articles/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '@/lib/aws/s3-client';
import { parseRSS } from '@/lib/aws/rss-parser';
import { convertRSSItemToArticle, ArticleMetadata } from '@/lib/aws/article-converter';
import { withRetry } from '@/lib/aws/s3-retry';
import { handleS3Error } from '@/lib/aws/s3-error-handler';

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME!;
const BASE_PREFIX = process.env.AWS_S3_PREFIX || '';

const TOPICS = ['capital', 'english', 'finance', 'market', 'prnewswire', 'real_estate', 'special'];

// 日付形式: YYYY-MM-DD
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// トピックと日付からプレフィックスを生成
function getTopicPrefix(topic: string, date?: string): string {
  const dateStr = date || formatDate(new Date());
  // ベースプレフィックスが空の場合は、トピックから始める
  return BASE_PREFIX ? `${BASE_PREFIX}${topic}/${dateStr}/` : `${topic}/${dateStr}/`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const topic = searchParams.get('topic') || 'all';
    const date = searchParams.get('date'); // YYYY-MM-DD形式
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let articles: ArticleMetadata[] = [];

    if (topic === 'all') {
      // 全トピックから取得
      const allArticles = await Promise.all(
        TOPICS.map((t) => fetchArticlesByTopic(t, date, limit + offset))
      );
      articles = allArticles.flat();
      // 日付でソート（新しい順）
      articles.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
      // オフセットとリミットを適用
      articles = articles.slice(offset, offset + limit);
    } else {
      articles = await fetchArticlesByTopic(topic, date, limit + offset);
      articles = articles.slice(offset, offset + limit);
    }

    return NextResponse.json(
      {
        articles,
        total: articles.length,
        hasMore: articles.length === limit,
      },
      { status: 200 }
    );
  } catch (error) {
    const { message, statusCode } = handleS3Error(error);
    console.error('Error fetching articles from S3:', error);
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}

async function fetchArticlesByTopic(
  topic: string,
  date?: string,
  maxKeys: number = 1000
): Promise<ArticleMetadata[]> {
  const prefix = getTopicPrefix(topic, date);

  const listCommand = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: prefix,
    MaxKeys: maxKeys,
  });

  const listResponse = await withRetry(async () => {
    return await s3Client.send(listCommand);
  });

  if (!listResponse.Contents || listResponse.Contents.length === 0) {
    return [];
  }

  // 各XMLファイルから記事を取得
  const allArticles: ArticleMetadata[] = [];

  for (const object of listResponse.Contents) {
    if (!object.Key || !object.Key.endsWith('.xml')) {
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

      const xmlContent = await getResponse.Body?.transformToString();
      if (!xmlContent) continue;

      // RSSをパース
      const parsedRSS = parseRSS(xmlContent);

      // 各アイテムを記事データに変換
      for (const item of parsedRSS.items) {
        const article = convertRSSItemToArticle(item, object.Key);
        allArticles.push(article);
      }
    } catch (error) {
      console.error(`Error processing ${object.Key}:`, error);
      // エラーが発生しても他のファイルの処理を続行
      continue;
    }
  }

  return allArticles;
}
```

#### 4.2.5 キャッシュ戦略の実装

**ファイル**: `src/lib/aws/s3-cache.ts`

```typescript
import { ArticleMetadata } from '@/types/article';

const CACHE_TTL = 15 * 60 * 1000; // 15分
const cache = new Map<string, { data: ArticleMetadata[]; timestamp: number }>();

export async function getCachedArticles(
  topic: string,
  fetcher: () => Promise<ArticleMetadata[]>
): Promise<ArticleMetadata[]> {
  const cacheKey = `articles:${topic}`;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const data = await fetcher();
  cache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}

export function invalidateCache(topic?: string) {
  if (topic) {
    cache.delete(`articles:${topic}`);
  } else {
    cache.clear();
  }
}
```

### タスク3: S3オブジェクトのメタデータ（_source_uriなど）の活用

#### 4.3.1 RSSアイテムからのメタデータ抽出

RSS XMLファイルから取得した情報をメタデータとして活用します。

**実装例**:
```typescript
// src/lib/aws/article-metadata.ts
import { RSSItem } from './rss-parser';

export interface ArticleMetadata {
  _source_uri: string; // RSSアイテムのguid（元記事のURL）
  _s3_key: string; // S3オブジェクトのキー
  _categories: string[]; // RSSアイテムのcategory
  _published_at: string; // RSSアイテムのpubDate
  _updated_at?: string; // S3オブジェクトのLastModified
  _author: string; // RSSアイテムのauthor
}

export function extractMetadataFromRSSItem(
  item: RSSItem,
  s3Key: string,
  lastModified?: Date
): ArticleMetadata {
  return {
    _source_uri: item.guid,
    _s3_key: s3Key,
    _categories: item.category || [],
    _published_at: item.pubDate,
    _updated_at: lastModified?.toISOString(),
    _author: item.author || 'PR Newswire',
  };
}
```

#### 4.3.2 メタデータを活用した記事表示

記事詳細ページでメタデータを表示し、出典情報を明確にします。`_source_uri`にはRSSアイテムの`guid`（元記事のURL）が格納されています。

### タスク4: 記事データのS3からの同期・更新メカニズム

#### 4.4.1 定期同期の実装

**ファイル**: `src/lib/aws/s3-sync.ts`

```typescript
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { s3Client } from './s3-client';
import { invalidateCache } from './s3-cache';

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME!;
const BASE_PREFIX = process.env.AWS_S3_PREFIX || '';

const TOPICS = ['capital', 'english', 'finance', 'market', 'prnewswire', 'real_estate', 'special'];

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getTopicPrefix(topic: string, date?: string): string {
  const dateStr = date || formatDate(new Date());
  // ベースプレフィックスが空の場合は、トピックから始める
  return BASE_PREFIX ? `${BASE_PREFIX}${topic}/${dateStr}/` : `${topic}/${dateStr}/`;
}

export async function syncArticlesFromS3(topic?: string, date?: string): Promise<void> {
  try {
    if (topic) {
      const prefix = getTopicPrefix(topic, date);
      const command = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
      });

      const response = await s3Client.send(command);
      invalidateCache(topic);
      console.log(`Synced ${response.KeyCount || 0} articles from S3 for topic: ${topic}`);
    } else {
      // 全トピックを同期
      for (const t of TOPICS) {
        await syncArticlesFromS3(t, date);
      }
    }
  } catch (error) {
    console.error('Error syncing articles from S3:', error);
    throw error;
  }
}

// 定期実行（Next.js API RouteまたはCron Job）
export async function scheduledSync(date?: string) {
  const syncDate = date || formatDate(new Date());
  
  for (const topic of TOPICS) {
    await syncArticlesFromS3(topic, syncDate);
  }
}
```

#### 4.4.2 更新検出の実装

S3オブジェクトの`LastModified`タイムスタンプを比較して、更新された記事のみを取得します。

```typescript
export async function getUpdatedArticles(
  since: Date,
  topic?: string,
  date?: string
): Promise<string[]> {
  const prefix = topic ? getTopicPrefix(topic, date) : BASE_PREFIX;
  
  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: prefix,
  });

  const response = await s3Client.send(command);
  const updatedKeys: string[] = [];

  if (response.Contents) {
    for (const object of response.Contents) {
      if (object.LastModified && object.LastModified > since && object.Key) {
        updatedKeys.push(object.Key);
      }
    }
  }

  return updatedKeys;
}
```

### タスク5: S3イベント通知（S3 Event Notifications）によるリアルタイム更新（Lambdaベース）

#### 4.5.1 S3 → Lambda 直接連携（基本構成・推奨）

S3バケットに新しいPRNAフィードファイルがアップロードされたタイミングで、Lambda関数を自動起動し、RSS解析・メタデータ整形・DB反映を行います。

**AWSコンソールでの設定手順**:
1. S3バケット（`newfan-finance`）の「プロパティ」タブを開く
2. 「イベント通知」セクションで「イベント通知を作成」
3. 以下の設定を行う:
   - **名前**: `prna-article-update-notification`
   - **プレフィックス**: 空（トピックフォルダがトップレベルにあるため、各トピックごとに個別に設定するか、プレフィックスなしで設定）
   - **サフィックス**: `.xml`
   - **イベントタイプ**: `s3:ObjectCreated:*`, `s3:ObjectRemoved:*`
   - **送信先**: Lambda 関数（例: `prna-rss-ingestor`）

**注意**: 特定のトピックのみを監視する場合は、プレフィックスに `{topic}/` を指定してください（例: `finance/`）。

**Lambda関数の処理イメージ**（擬似コード）:

```typescript
// lambda/prna-rss-ingestor.ts
import { S3Event } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { parseRSS } from '@/lib/aws/rss-parser';
import { convertRSSItemToArticle } from '@/lib/aws/article-converter';

const s3 = new S3Client({ region: process.env.AWS_REGION });

export const handler = async (event: S3Event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    if (!key.endsWith('.xml')) continue;

    const res = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );

    const xml = await res.Body?.transformToString();
    if (!xml) continue;

    const rss = parseRSS(xml);

    // RSSアイテムを記事メタデータへ変換し、DBや検索インデックスへ保存
    for (const item of rss.items) {
      const article = convertRSSItemToArticle(item, key);
      // saveArticleToDatabase(article); // ここで永続化処理を呼び出す
    }
  }
};
```

Next.js 側は、Lambda が保存した DB / キャッシュから記事一覧・詳細を取得するだけにし、  
S3 への直接アクセスは Lambda に集約することで、責務分離とセキュリティを高めます。

#### 4.5.2 SQSキューを使用した実装（オプション）

イベント数が多い、またはバーストを平滑化したい場合は、S3 → SQS → Lambda 構成とします。

**SQSキューの作成**:
1. AWS SQSコンソールで新しいキューを作成
2. キュー名: `prna-article-updates`
3. S3イベント通知の送信先に設定

**Lambda（またはNext.js API Route）での処理**:
```typescript
// src/app/api/s3-webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ReceiveMessageCommand, DeleteMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { syncArticlesFromS3 } from '@/lib/aws/s3-sync';

const sqsClient = new SQSClient({ region: process.env.AWS_REGION });
const QUEUE_URL = process.env.AWS_SQS_QUEUE_URL!;

export async function POST(request: NextRequest) {
  try {
    // SQSからメッセージを取得
    const command = new ReceiveMessageCommand({
      QueueUrl: QUEUE_URL,
      MaxNumberOfMessages: 10,
    });

    const response = await sqsClient.send(command);

    if (response.Messages && response.Messages.length > 0) {
      for (const message of response.Messages) {
        if (message.Body) {
          const event = JSON.parse(message.Body);
          
          // S3イベントを処理
          if (event.Records) {
            for (const record of event.Records) {
              const key = record.s3.object.key;
              const topic = extractTopicFromKey(key);
              const date = extractDateFromKey(key);
              
              if (topic) {
                await syncArticlesFromS3(topic, date);
              }
            }
          }

          // メッセージを削除
          await sqsClient.send(
            new DeleteMessageCommand({
              QueueUrl: QUEUE_URL,
              ReceiptHandle: message.ReceiptHandle,
            })
          );
        }
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error('Error processing S3 webhook:', error);
    return NextResponse.json(
      { error: 'Failed to process webhook', message: error.message },
      { status: 500 }
    );
  }
}

function extractTopicFromKey(key: string): string | undefined {
  // {topic}/{date}/{uuid}.xml から topic を抽出
  // トピックフォルダがトップレベルにあるため、最初のパスセグメントを取得
  const match = key.match(/^([^/]+)\//);
  return match ? match[1] : undefined;
}

function extractDateFromKey(key: string): string | undefined {
  // {topic}/{date}/{uuid}.xml から date を抽出
  const match = key.match(/\/(\d{4}-\d{2}-\d{2})\//);
  return match ? match[1] : undefined;
}
```

#### 4.5.3 Lambda関数を使用した実装（オプション）

Lambda関数でS3イベントを処理し、Next.js APIに通知する方法も可能です。

### タスク6: エラーハンドリングとリトライロジックの実装

#### 4.6.1 リトライロジックの実装

**ファイル**: `src/lib/aws/s3-retry.ts`

```typescript
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // リトライ不可能なエラー（認証エラーなど）は即座にスロー
      if (error.name === 'AccessDenied' || error.name === 'InvalidAccessKeyId') {
        throw error;
      }

      // 指数バックオフでリトライ
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, i)));
      }
    }
  }

  throw lastError!;
}
```

#### 4.6.2 エラーハンドリングの実装

**ファイル**: `src/lib/aws/s3-error-handler.ts`

```typescript
import { S3ServiceException } from '@aws-sdk/client-s3';

export function handleS3Error(error: unknown): { message: string; statusCode: number } {
  if (error instanceof S3ServiceException) {
    switch (error.name) {
      case 'NoSuchBucket':
        return { message: 'S3 bucket not found', statusCode: 404 };
      case 'AccessDenied':
        return { message: 'Access denied to S3 bucket', statusCode: 403 };
      case 'InvalidAccessKeyId':
        return { message: 'Invalid AWS credentials', statusCode: 401 };
      case 'NetworkError':
        return { message: 'Network error connecting to S3', statusCode: 503 };
      default:
        return { message: `S3 error: ${error.message}`, statusCode: 500 };
    }
  }

  return { message: 'Unknown error occurred', statusCode: 500 };
}
```

#### 4.6.3 API Routeでのエラーハンドリング統合

```typescript
import { withRetry } from '@/lib/aws/s3-retry';
import { handleS3Error } from '@/lib/aws/s3-error-handler';

export async function GET(request: NextRequest) {
  try {
    const articles = await withRetry(async () => {
      // S3から記事を取得する処理
      return await fetchArticlesFromS3();
    });

    return NextResponse.json({ articles }, { status: 200 });
  } catch (error) {
    const { message, statusCode } = handleS3Error(error);
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
```

## 5. セキュリティチェックリスト

### 5.1 IAMロールとポリシー
- [ ] IAMポリシー `prna-news-readonly-policy` が作成されている
- [ ] ポリシーに最小権限のみが設定されている（読み取り専用）
- [ ] トピックフォルダへのアクセスのみが許可されている
- [ ] IAMロール `prna-news-readonly-role` が作成されている
- [ ] ロールの信頼関係ポリシーが正しく設定されている（使用するサービスに応じて）
- [ ] ポリシーがロールにアタッチされている
- [ ] ロールが正しく動作することをテスト済み

### 5.2 認証情報管理
- [ ] 本番環境ではIAMロールを使用（認証情報をコードに含めない）
- [ ] 開発環境の認証情報を環境変数で管理
- [ ] `.env.local`を`.gitignore`に追加
- [ ] 一時的な認証情報の有効期限を適切に設定（ローカル開発時）

### 5.3 S3バケットセキュリティ
- [ ] S3バケットポリシーでIP制限を設定（必要に応じて）
- [ ] CloudTrailでS3アクセスを監査
- [ ] S3バケットのバージョニングが有効（必要に応じて）
- [ ] S3バケットの暗号化が有効

### 5.4 アプリケーションセキュリティ
- [ ] エラーメッセージに機密情報を含めない
- [ ] HTTPS通信を強制
- [ ] レート制限を実装（DoS攻撃対策）
- [ ] 入力値の検証を実装
- [ ] ログに機密情報を出力しない

## 6. テスト

### 6.1 単体テスト

```typescript
// src/lib/aws/__tests__/s3-client.test.ts
import { s3Client } from '../s3-client';

describe('S3 Client', () => {
  it('should create S3 client with correct region', () => {
    expect(s3Client.config.region).toBe(process.env.AWS_REGION);
  });
});
```

### 6.2 統合テスト

- S3バケットへの接続テスト
- 記事データの取得テスト
- エラーハンドリングのテスト
- リトライロジックのテスト

## 7. デプロイメント

### 7.1 環境変数の設定

本番環境（Lambda ベース）:
- Lambda 実行ロールに `prna-news-readonly-policy` と `AWSLambdaBasicExecutionRole` をアタッチ
- 環境変数: 
  - `AWS_REGION=ap-northeast-1`
  - `AWS_S3_BUCKET_NAME=newfan-finance`
  - `AWS_S3_PREFIX=prna/raw`（実際のS3パス構造に合わせる）
  - DB/検索基盤接続情報（例: `DB_ENDPOINT`, `DB_NAME`, `DB_USER` など）

Vercel（Next.js アプリケーション）:
- **S3への直接アクセスは原則行わず、Lambda／DB経由でデータ取得**する
- Vercel ダッシュボードで以下の環境変数を設定:
  - `NEXT_PUBLIC_API_BASE_URL`（API Gateway や自前のバックエンドのエンドポイント）
  - 必要に応じてアプリ固有のフラグ（例: `NEXT_PUBLIC_ENV=production` など）
- **AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY は Vercel には設定しないことを推奨**  
  （どうしても必要な場合でも、権限を強く絞った専用IAMユーザーを使用し、Lambda実行ロールとは分離する）

### 7.2 モニタリング

- CloudWatchでS3アクセスログを監視
- エラー率とレイテンシーを追跡
- アラートを設定

## 8. トラブルシューティング

### よくある問題

1. **AccessDeniedエラー**
   - IAMロールの権限を確認
   - バケットポリシーを確認

2. **ネットワークエラー**
   - VPCエンドポイントの設定を確認
   - セキュリティグループの設定を確認

3. **認証情報エラー**
   - 環境変数の設定を確認
   - IAMロールのアタッチを確認

## 9. 参考資料

- [AWS SDK for JavaScript v3 - S3 Client](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/)
- [IAM ベストプラクティス](https://docs.aws.amazon.com/ja_jp/IAM/latest/UserGuide/best-practices.html)
- [S3 イベント通知](https://docs.aws.amazon.com/ja_jp/AmazonS3/latest/userguide/NotificationHowTo.html)
