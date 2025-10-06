# NewFan-Finance

これは、Next.js、LangChain、Drizzle ORM、Tailwind CSSを使用して構築されたAIチャットアプリケーションのフロントエンドです。

## ディレクトリ構成

- `src/app/api`: APIルートが含まれており、チャット、検索、設定などのバックエンド機能を処理します。
- `src/app/*`: Next.jsのApp Routerを使用したページの各コンポーネントです。
- `src/components`: アプリケーション全体で使用されるReactコンポーネントです。
- `src/lib`: アプリケーションのコアロジックが含まれています。
  - `src/lib/actions`: サーバーアクションを定義します。
  - `src/lib/chains`: LangChainのチェーンを定義します。
  - `src/lib/db`: Drizzle ORMを使用したデータベースのスキーマとマイグレーションファイルです。
  - `src/lib/hooks`: Reactのカスタムフックです。
  - `src/lib/providers`: AIモデルのプロバイダーを定義します。
  - `src/lib/search`: 検索機能を実装します。

## 主な機能

- **チャット**: AIモデルとの対話が可能です。
- **検索**: Web検索、画像検索、動画検索が可能です。
- **設定**: アプリケーションの設定を変更できます。
- **多言語対応**: i18nextを使用して多言語に対応しています。
- **テーマ変更**: next-themesを使用してライトモードとダークモードの切り替えが可能です。

## 使用技術

- **フレームワーク**: Next.js
- **UIライブラリ**: React, Tailwind CSS
- **AI**: LangChain, Transformers.js
- **データベース**: Drizzle ORM, better-sqlite3
- **その他**: i18next, next-themes, zod
