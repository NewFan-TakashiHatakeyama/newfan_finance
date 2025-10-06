# 🚀 Perplexica - AI搭載の検索エンジン 🔎 <!-- omit in toc -->

<div align="center" markdown="1">
   <sup>スペシャルサンクス:</sup>
   <br>
   <br>
   <a href="https://www.warp.dev/perplexica">
      <img alt="Warp sponsorship" width="400" src="https://github.com/user-attachments/assets/775dd593-9b5f-40f1-bf48-479faff4c27b">
   </a>

### [Warp、ターミナルに住むAI Devtool](https://www.warp.dev/perplexica)

[MacOS、Linux、Windowsで利用可能](https://www.warp.dev/perplexica)

</div>

<hr/>

[![Discord](https://dcbadge.limes.pink/api/server/26aArMy8tT?style=flat)](https://discord.gg/26aArMy8tT)

![preview](.assets/perplexica-screenshot.png?)

## 目次 <!-- omit in toc -->

- [概要](#概要)
- [プレビュー](#プレビュー)
- [特徴](#特徴)
- [インストール](#インストール)
  - [Dockerでの開始（推奨）](#dockerでの開始推奨)
  - [Dockerを使わないインストール](#dockerを使わないインストール)
  - [Ollama接続エラー](#ollama接続エラー)
  - [Lemonade接続エラー](#lemonade接続エラー)
- [検索エンジンとしての使用](#検索エンジンとしての使用)
- [PerplexicaのAPI利用](#perplexicaのapi利用)
- [ネットワークへのPerplexicaの公開](#ネットワークへのperplexicaの公開)
- [ワンクリックデプロイ](#ワンクリックデプロイ)
- [今後の機能](#今後の機能)
- [サポート](#サポート)
  - [寄付](#寄付)
- [貢献](#貢献)
- [ヘルプとサポート](#ヘルプとサポート)

## 概要

Perplexicaは、インターネットを深く探って答えを見つけ出す、オープンソースのAI搭載検索ツールまたはAI搭載検索エンジンです。Perplexity AIにインスパイアされたオープンソースの選択肢であり、ウェブを検索するだけでなく、あなたの質問を理解します。類似性検索や埋め込みのような高度な機械学習アルゴリズムを使用して結果を洗練し、引用元付きの明確な回答を提供します。

SearxNGを使用して常に最新であり、完全にオープンソースであるPerplexicaは、プライバシーを損なうことなく常に最新の情報を得られることを保証します。

そのアーキテクチャと仕組みについてもっと知りたいですか？[こちら](https://github.com/ItzCrazyKns/Perplexica/tree/master/docs/architecture/README.md)で読むことができます。

## プレビュー

![video-preview](.assets/perplexica-preview.gif)

## 特徴

- **ローカルLLM**: Qwen、DeepSeek、Llama、MistralなどのローカルLLMを利用できます。
- **2つの主要モード:**
  - **Copilotモード:** (開発中) より関連性の高いインターネットソースを見つけるために、さまざまなクエリを生成して検索を強化します。SearxNGによるコンテキストを使用するだけでなく、通常の検索のようにトップマッチを訪れ、ユーザーのクエリに直接関連するソースをページから見つけようとします。
  - **通常モード:** クエリを処理し、ウェブ検索を実行します。
- **フォーカスモード:** 特定の種類の質問により良く答えるための特別モード。Perplexicaには現在6つのフォーカスモードがあります:
  - **Allモード:** ウェブ全体を検索して最適な結果を見つけます。
  - **Writing Assistantモード:** ウェブ検索を必要としない執筆タスクに役立ちます。
  - **Academic Searchモード:** 学術研究に理想的な論文や記事を見つけます。
  - **YouTube Searchモード:** 検索クエリに基づいてYouTube動画を見つけます。
  - **Wolfram Alpha Searchモード:** Wolfram Alphaを使用して計算やデータ分析が必要なクエリに答えます。
  - **Reddit Searchモード:** クエリに関連する議論や意見をRedditで検索します。
- **最新情報:** 一部の検索ツールは、クローリングボットからのデータを使用し、それらを埋め込みに変換してインデックスに保存するため、古い情報を提供する可能性があります。それらとは異なり、Perplexicaはメタ検索エンジンであるSearxNGを使用して結果を取得し、再ランク付けして最も関連性の高いソースを見つけ出すため、日々のデータ更新のオーバーヘッドなしに常に最新の情報を得ることができます。
- **API**: Perplexicaを既存のアプリケーションに統合し、その能力を活用します。

画像検索や動画検索など、他にも多くの機能があります。計画中の機能の一部は[今後の機能](#今後の機能)で言及されています。

## インストール

Perplexicaのインストール方法は主に2つあります - Dockerを使用する方法と、Dockerを使用しない方法です。Dockerの使用を強くお勧めします。

### Dockerでの開始（推奨）

1.  Dockerがシステムにインストールされ、実行されていることを確認してください。
2.  Perplexicaリポジトリをクローンします:
    ```bash
    git clone https://github.com/ItzCrazyKns/Perplexica.git
    ```
3.  クローンした後、プロジェクトファイルを含むディレクトリに移動します。
4.  `sample.config.toml`ファイルを`config.toml`に名前変更します。Dockerセットアップでは、以下のフィールドのみを入力する必要があります:
    - `OPENAI`: OpenAI APIキー。**OpenAIのモデルを使用する場合のみ入力が必要です**。
    - `CUSTOM_OPENAI`: OpenAI-API互換のローカルサーバーURL、モデル名、APIキー。ローカルサーバーをホスト`0.0.0.0`で実行し、実行されているポート番号をメモし、そのポート番号を使用して`API_URL = http://host.docker.internal:PORT_NUMBER`を設定する必要があります。`MODEL_NAME = "unsloth/DeepSeek-R1-0528-Qwen3-8B-GGUF:Q4_K_XL"`のようにモデル名を指定する必要があります。最後に、`API_KEY`を適切な値に設定します。APIキーを定義していない場合は、引用符の間に何か好きなものを入れてください: `API_KEY = "whatever-you-want-but-not-blank"` **Llama.cppの[`llama-server`](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)のようなローカルのOpenAI互換サーバーを使用する場合のみ、これらの設定を構成する必要があります**。
    - `OLLAMA`: Ollama API URL。`http://host.docker.internal:PORT_NUMBER`として入力する必要があります。Ollamaをポート11434にインストールした場合は、`http://host.docker.internal:11434`を使用します。他のポートの場合は、適宜調整してください。**OpenAIのモデルの代わりにOllamaのモデルを使用したい場合は、これを入力する必要があります**。
    - `LEMONADE`: Lemonade API URL。Lemonadeはローカルマシンで直接実行されるため（Docker内ではない）、`http://host.docker.internal:PORT_NUMBER`として入力する必要があります。Lemonadeをポート8000にインストールした場合は、`http://host.docker.internal:8000`を使用します。他のポートの場合は、適宜調整してください。**Lemonadeのモデルを使用したい場合は、これを入力する必要があります**。
    - `GROQ`: Groq APIキー。**Groqのホストモデルを使用したい場合のみ入力が必要です**。
    - `ANTHROPIC`: Anthropic APIキー。**Anthropicモデルを使用したい場合のみ入力が必要です**。
    - `Gemini`: Gemini APIキー。**Googleのモデルを使用したい場合のみ入力が必要です**。
    - `DEEPSEEK`: Deepseek APIキー。**Deepseekモデルが必要な場合のみ**。
    - `AIMLAPI`: AI/ML APIキー。**AI/ML APIモデルと埋め込みを使用したい場合のみ必要です**。
      **注意**: これらはPerplexicaを起動した後、設定ダイアログから変更できます。
    - `SIMILARITY_MEASURE`: 使用する類似性尺度（これはデフォルトで入力されています。よくわからない場合はそのままでかまいません。）
5.  `docker-compose.yaml`ファイルがあるディレクトリにいることを確認し、実行します:
    ```bash
    docker compose up -d
    ```
6.  セットアップが完了するまで数分待ちます。Webブラウザで http://localhost:3000 にアクセスしてPerplexicaを利用できます。

**注意**: コンテナがビルドされた後、ターミナルを開かずにDockerから直接Perplexicaを起動できます。

### Dockerを使わないインストール

1.  SearXNGをインストールし、SearXNGの設定で`JSON`形式を許可します。
2.  リポジトリをクローンし、ルートディレクトリの`sample.config.toml`ファイルを`config.toml`に名前変更します。このファイルに必要なフィールドをすべて入力してください。
3.  設定を入力した後、`npm i`を実行します。
4.  依存関係をインストールした後、`npm run build`を実行します。
5.  最後に、`npm run start`を実行してアプリを起動します。

**注意**: Dockerを使用すると、特に環境変数や依存関係の管理においてセットアッププロセスが簡素化されるため、推奨されます。

更新などの詳細については、[インストールマニュアル](https://github.com/ItzCrazyKns/Perplexica/tree/master/docs/installation)を参照してください。

### トラブルシューティング

#### ローカルOpenAI-API互換サーバー

Perplexicaがチャットモデルプロバイダーを設定していないと表示する場合、以下を確認してください:

1.  サーバーが`127.0.0.1`ではなく`0.0.0.0`で実行されており、API URLに入力したポートと同じポートで実行されていること。
2.  ローカルLLMサーバーによってロードされた正しいモデル名を指定していること。
3.  正しいAPIキーを指定しているか、定義されていない場合はAPIキーフィールドに何かを入力し、空のままにしていないこと。

#### Ollama接続エラー

Ollama接続エラーが発生している場合、バックエンドがOllamaのAPIに接続できないことが原因である可能性が高いです。この問題を解決するには、次のことができます:

1.  **Ollama API URLを確認する:** 設定メニューでAPI URLが正しく設定されていることを確認してください。
2.  **OSに基づいてAPI URLを更新する:**
    - **Windows:** `http://host.docker.internal:11434` を使用
    - **Mac:** `http://host.docker.internal:11434` を使用
    - **Linux:** `http://<private_ip_of_host>:11434` を使用
      別のポートを使用している場合は、ポート番号を調整してください。
3.  **Linuxユーザー - Ollamaをネットワークに公開する:**
    - `/etc/systemd/system/ollama.service`内に、`Environment="OLLAMA_HOST=0.0.0.0:11434"`を追加する必要があります。（別のポートを使用している場合はポート番号を変更してください。）その後、`systemctl daemon-reload`でsystemdマネージャーの設定をリロードし、`systemctl restart ollama`でOllamaを再起動します。詳細については、[Ollamaのドキュメント](https://github.com/ollama/ollama/blob/main/docs/faq.md#setting-environment-variables-on-linux)を参照してください。
    - ポート（デフォルトは11434）がファイアウォールでブロックされていないことを確認してください。

#### Lemonade接続エラー

Lemonade接続エラーが発生している場合、バックエンドがLemonadeのAPIに接続できないことが原因である可能性が高いです。この問題を解決するには、次のことができます:

1.  **Lemonade API URLを確認する:** 設定メニューでAPI URLが正しく設定されていることを確認してください。
2.  **OSに基づいてAPI URLを更新する:**
    - **Windows:** `http://host.docker.internal:8000` を使用
    - **Mac:** `http://host.docker.internal:8000` を使用
    - **Linux:** `http://<private_ip_of_host>:8000` を使用
      別のポートを使用している場合は、ポート番号を調整してください。
3.  **Lemonadeサーバーが実行されていることを確認する:**
    - Lemonadeサーバーが設定されたポート（デフォルトは8000）で実行され、アクセス可能であることを確認してください。
    - Lemonadeがlocalhost (`127.0.0.1`)だけでなく、すべてのインターフェース(`0.0.0.0`)からの接続を受け入れるように設定されていることを確認してください。
    - ポート（デフォルトは8000）がファイアウォールでブロックされていないことを確認してください。

## 検索エンジンとしての使用

PerplexicaをGoogleやBingなどの従来の検索エンジンの代替として使用したい場合、またはブラウザの検索バーから素早くアクセスするためのショートカットを追加したい場合は、次の手順に従ってください:

1.  ブラウザの設定を開きます。
2.  「検索エンジン」セクションに移動します。
3.  次のURLで新しいサイト検索を追加します: `http://localhost:3000/?q=%s`。Perplexicaがローカルでホストされていない場合は、`localhost`をIPアドレスまたはドメイン名に、`3000`をポート番号に置き換えてください。
4.  追加ボタンをクリックします。これで、ブラウザの検索バーから直接Perplexicaを使用できます。

## PerplexicaのAPI利用

Perplexicaは、強力な検索エンジンを独自のアプリケーションに統合したい開発者向けにAPIも提供しています。検索を実行したり、複数のモデルを使用したり、クエリへの回答を得ることができます。

詳細については、[こちら](https://github.com/ItzCrazyKns/Perplexica/tree/master/docs/API/SEARCH.md)の完全なドキュメントをご覧ください。

## ネットワークへのPerplexicaの公開

PerplexicaはNext.jsで動作し、すべてのAPIリクエストを処理します。同じネットワーク上ですぐに機能し、ポートフォワーディングがあってもアクセス可能です。

## ワンクリックデプロイ

[![Deploy to Sealos](https://raw.githubusercontent.com/labring-actions/templates/main/Deploy-on-Sealos.svg)](https://usw.sealos.io/?openapp=system-template%3FtemplateName%3Dperplexica)
[![Deploy to RepoCloud](https://d16t0pc4846x52.cloudfront.net/deploylobe.svg)](https://repocloud.io/details/?app_id=267)
[![Run on ClawCloud](https://raw.githubusercontent.com/ClawCloud/Run-Template/refs/heads/main/Run-on-ClawCloud.svg)](https://template.run.claw.cloud/?referralCode=U11MRQ8U9RM4&openapp=system-fastdeploy%3FtemplateName%3Dperplexica)
[![Deploy on Hostinger](https://assets.hostinger.com/vps/deploy.svg)](https://www.hostinger.com/vps/docker-hosting?compose_url=https://raw.githubusercontent.com/ItzCrazyKns/Perplexica/refs/heads/master/docker-compose.yaml)

## 今後の機能

- [x] 設定ページの追加
- [x] ローカルLLMのサポート追加
- [x] 履歴保存機能
- [x] さまざまなフォーカスモードの導入
- [x] APIサポートの追加
- [x] Discoverの追加
- [ ] Copilotモードの最終化

## サポート

Perplexicaが役に立ったと思ったら、GitHubでスターを付けてください。これにより、より多くの人々がPerplexicaを発見し、新機能の開発をサポートすることになります。ご支援に心より感謝申し上げます。

### 寄付

また、プロジェクトを維持するための寄付も受け付けています。貢献したい場合は、以下のオプションを使用して寄付できます。ご支援ありがとうございます！

| Ethereum                                              |
| ----------------------------------------------------- |
| Address: `0xB025a84b2F269570Eb8D4b05DEdaA41D8525B6DD` |

## 貢献

Perplexicaは、AIと大規模言語モデルが誰にとっても使いやすいものであるべきだという考えに基づいて構築されています。バグを見つけたり、アイデアがある場合は、GitHub Issuesで共有してください。Perplexicaへの貢献に関する詳細については、[CONTRIBUTING.md](CONTRIBUTING.md)ファイルを参照して、Perplexicaと貢献方法について学んでください。

## ヘルプとサポート

ご質問やフィードバックがございましたら、お気軽にお問い合わせください。GitHubでIssueを作成するか、Discordサーバーに参加してください。そこでは、他のユーザーとつながり、経験やレビューを共有し、よりパーソナライズされたヘルプを受けることができます。[こちら](https://discord.gg/EFwsmQDgAu)をクリックしてDiscordサーバーに参加してください。通常のサポート以外の事項については、Discordで`itzcrazykns`までお気軽にご連絡ください。

検索体験を向上させるために設計されたAI搭載検索エンジン、Perplexicaをご利用いただきありがとうございます。私たちは常にPerplexicaを改善し、その能力を拡大するために取り組んでいます。皆様のフィードバックと貢献は、Perplexicaをさらに良くするのに役立ちます。アップデートや新機能にご期待ください！
