# Project NewFan: Discoverページ 技術設計書

## 1. 概要

本プロジェクトの目的は、Perplexicaアプリケーションの`discover`ページにおけるデータ取得方法を、既存のSearxNGを利用したWeb検索から、指定されたカテゴリ別のRSSフィードをデータソースとする方式に変更することである。

これにより、より専門的で信頼性の高い情報源から、定義されたカテゴリに沿ったニュース記事をユーザーに提供する。

## 2. コア技術

- **フロントエンド**: Next.js (React) - App Router
- **バックエンド**: Next.js API Route Handlers
- **データソース**: 外部RSSフィード (XML形式)
- **RSS解析ライブラリ**: `rss-parser` (導入を推奨)
- **キャッシュ戦略**: Next.js Time-based Revalidation

## 3. データフロー

ユーザーによる記事閲覧までのデータフローは以下の通り。

1.  **ユーザー**: `discover`ページでカテゴリ（例：「金融・投資」）を選択。
2.  **フロントエンド**: 選択されたカテゴリのキー（例：`finance`）を付けてバックエンドAPIにリクエスト。
3.  **バックエンドAPI**:
    a. キャッシュを確認し、有効なデータがあれば即座に返却。
    b. キャッシュがない、または失効している場合、対応するRSSフィードURLにデータを取得しに行く。
4.  **RSSフィード**: XML形式のデータを返す。
5.  **バックエンドAPI**:
    a. 受け取ったXMLを解析・整形する。
    b. 整形したデータをNext.jsのデータキャッシュに保存する。
    c. フロントエンドにJSON形式でデータを返す。
6.  **フロントエンド**: 受け取ったデータを画面に描画する。
7.  **ユーザー**: 記事リストを閲覧する。

## 4. バックエンド設計 (API Route: `/api/discover`)

### 4.1. エンドポイント

- `GET /api/discover?topic=<topic_key>`
- `topic_key`には、`finance`, `market`などのカテゴリを識別する文字列が入る。

### 4.2. 実装ロジック

1.  **カテゴリとURLのマッピング**:
    API内部に、`topic_key`とRSSフィードのURLを紐付けるオブジェクトを定義する。

    ```javascript
    const rssFeedUrls = {
      'finance': 'http://www.prnasia.com/m/mediafeed/rss?id=4231',
      'market': 'http://www.prnasia.com/m/mediafeed/rss?id=4232',
      'capital': 'http://www.prnasia.com/m/mediafeed/rss?id=4233',
      'realestate': 'http://www.prnasia.com/m/mediafeed/rss?id=4234',
      'specialized': 'http://www.prnasia.com/m/mediafeed/rss?id=4235',
      'pr': 'http://www.prnasia.com/m/mediafeed/rss?id=3249'
    };
    ```

2.  **RSSの取得と解析**:
    -   `rss-parser`ライブラリを利用して、指定されたURLからRSSフィードを非同期で取得・解析する。
    -   このライブラリはXMLを自動でJSONに変換するため、複雑なパース処理を自前で実装する必要がない。

3.  **データ形式の変換**:
    -   解析済みのRSSアイテム配列をループ処理する。
    -   各アイテムを、フロントエンドが要求する`Discover`インターフェース（`title`, `url`, `content`, `thumbnail`）に準拠したオブジェクトに変換する。
        -   `title`: RSSアイテムの`title`
        -   `url`: RSSアイテムの`link`
        -   `content`: RSSアイテムの`contentSnippet`または`content`。HTMLタグが含まれる場合は除去する。
        -   `thumbnail`: RSSアイテムの`enclosure.url`を最優先で使用する。

### 4.3. キャッシュ戦略

- **Next.js Time-based Revalidation** を採用する。
- **実装方法**: RSSフィードを取得する`fetch`関数に`next: { revalidate: 900 }`オプションを追加する。
- **キャッシュ期間**: **900秒（15分）** に設定する。これにより、パフォーマンスとデータの鮮度のバランスを取る。
- **動作**: 15分間はキャッシュから即座に応答し、15分経過後の初回アクセスでバックグラウンドでデータを更新する ("stale-while-revalidate")。これにより、ユーザーは常に高速なレスポンスを得られる。

```javascript
// API Route内でのfetch呼び出し例
import Parser from 'rss-parser';

const parser = new Parser();
const feed = await parser.parseURL(rssFeedUrl); // rss-parserが内部でfetchを使う

// 注意：rss-parserが内部でfetchを使うため、Next.jsのキャッシュを直接利用できない可能性がある。
// その場合、まずfetchでXMLテキストを取得し、それをparserに渡す形にする。

const response = await fetch(rssFeedUrl, { next: { revalidate: 900 } });
const xmlText = await response.text();
const feed = await parser.parseString(xmlText);
```

**修正案**: `rss-parser`が内部で使う`fetch`ではNext.jsのキャッシュ機構が働かないため、一度`fetch`でXMLテキストとしてキャッシュ付きで取得し、その後`rss-parser`で文字列をパースする、という2段階の方式を採用する。

## 5. フロントエンド設計 (`/app/discover/page.tsx`)

- APIが返すデータ構造はこれまでと同一のため、データの受け取りや表示ロジックに関する**大きな変更は不要**。
- ユーザーがクリックしたカテゴリボタンと、APIに送信する`topic_key`の対応関係を維持する。
- RSSフィードから取得した`title`や`content`にHTMLエンティティ（例: `&amp;`）が含まれる場合があるため、表示前にデコード処理を行うライブラリ（`he`など）の利用を継続する。

