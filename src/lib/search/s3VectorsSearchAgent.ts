/**
 * S3 Vectors 検索エージェント
 *
 * MetaSearchAgent を拡張し、SearxNG の代わりに
 * S3 Vectors (PRNA 記事セマンティック検索) を使用する。
 *
 * フロー:
 *   1. LLM でユーザークエリをリフレーズ (MetaSearchAgent と同じ)
 *   2. S3 Vectors でセマンティック検索 (SearxNG の代替)
 *   3. ドキュメントリランキング
 *   4. LLM で応答生成 (citations 付き)
 *
 * フォーカスモードとカテゴリのマッピング:
 *   - finance → finance カテゴリ
 *   - market → market カテゴリ
 *   - capital → capital カテゴリ
 *   - real_estate → real_estate カテゴリ
 *   - special → special カテゴリ
 *   - prnewswire → prnewswire カテゴリ
 */

import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Embeddings } from '@langchain/core/embeddings';
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
  PromptTemplate,
} from '@langchain/core/prompts';
import {
  RunnableLambda,
  RunnableMap,
  RunnableSequence,
} from '@langchain/core/runnables';
import { BaseMessage } from '@langchain/core/messages';
import { StringOutputParser } from '@langchain/core/output_parsers';
import LineOutputParser from '../outputParsers/lineOutputParser';
import LineListOutputParser from '../outputParsers/listLineOutputParser';
import { Document } from 'langchain/document';
import { searchArticles, type SearchOptions } from '../aws/s3-vectors-search';
import computeSimilarity from '../utils/computeSimilarity';
import formatChatHistoryAsString from '../utils/formatHistory';
import eventEmitter from 'events';
import { StreamEvent } from '@langchain/core/tracers/log_stream';
import type { MetaSearchAgentType } from './metaSearchAgent';

// --- プロンプト定義 ---

/**
 * PRNA 記事検索用クエリリフレーザー (単一クエリ: speed / balanced)
 */
const queryGeneratorPrompt = `
You are a financial news search query optimizer. You will be given a conversation and a follow-up question about financial news, markets, or business.

Your task is to rephrase the follow-up question into an optimized search query for a financial news article database (PR Newswire / PRNA articles).

Rules:
1. If it is a simple greeting (Hi, Hello, How are you) without a question, return \`not_needed\`.
2. Rephrase the question to be a standalone search query optimized for semantic search.
3. Keep the query concise (under 50 words) and focused on the key financial concepts.
4. Preserve important financial terms, company names, and specific metrics.
5. You can use either Japanese or English depending on the original query language.
6. Return the query inside the \`question\` XML block.
`;

/**
 * 高精度モード用マルチクエリジェネレーター
 *
 * ユーザーの質問を複数の異なる視点で検索クエリに分解し、
 * 幅広い記事を網羅的に探索する。
 */
const multiQueryGeneratorPrompt = `
You are a financial news deep research query optimizer. You will be given a conversation and a follow-up question about financial news, markets, or business.

Your task is to generate **3 different search queries** that together comprehensively cover the user's question from multiple angles. These queries will be used for semantic search against a PR Newswire (PRNA) article database.

Strategy:
- Query 1: Direct rephrasing of the user's question (most specific)
- Query 2: Broader context or related industry/market perspective
- Query 3: Alternative phrasing using different terminology or language (Japanese ↔ English)

Rules:
1. If it is a simple greeting without a question, return \`not_needed\` in the first question block.
2. Each query should be concise (under 50 words).
3. Preserve important financial terms, company names, and specific metrics.
4. Use both Japanese and English across the queries to maximize coverage.
5. Return each query inside separate XML blocks: \`<question1>\`, \`<question2>\`, \`<question3>\`.
`;

/**
 * PRNA 記事検索用レスポンスプロンプト
 *
 * 日本語で応答し、PRNA 記事の内容を引用して
 * 詳細かつ正確な回答を生成する。
 */
const responsePrompt = `
You are NewFan Finance AI, a financial news analysis assistant specialized in PR Newswire (PRNA) articles. You provide accurate, well-sourced answers based on the financial news articles in your database.

**IMPORTANT**: Your response **MUST** be in Japanese.

Your task is to provide answers that are:
- **Informative and relevant**: Thoroughly address the user's query using the PRNA article context provided.
- **Well-structured**: Include clear headings and subheadings, and use a professional tone.
- **Cited and credible**: Use inline citations with [number] notation to refer to the source articles.
- **Financial expertise**: Demonstrate understanding of financial terminology and market dynamics.

### Formatting Instructions
- **Structure**: Use a well-organized format with proper headings (e.g., "## Example heading").
- **Tone and Style**: Maintain a professional financial journalism tone.
- **Markdown Usage**: Format with Markdown for clarity.
- **No main heading/title**: Start directly with the introduction.

### Citation Requirements
- Cite every fact using [number] notation corresponding to the source article.
- Include the article title and publication date when first citing a source.
- Use multiple sources for a single detail if applicable.

### Special Instructions
- If the context contains articles in English, translate key points into Japanese in your response.
- If no relevant articles are found, say: "申し訳ございませんが、ご質問に関連する記事が見つかりませんでした。別の質問をお試しください。"
- Highlight market trends, key figures, and actionable insights where applicable.

### User instructions
{systemInstructions}

<context>
{context}
</context>

Current date & time in ISO format (UTC timezone) is: {date}.
`;

// --- エージェント設定 ---

interface S3VectorsSearchConfig {
  /** S3 Vectors の category フィルタ (省略時はフィルタなし = 全カテゴリ検索) */
  category?: string;
  /** 検索結果の上限 */
  topK: number;
  /** リランキングの有効/無効 */
  rerank: boolean;
  /** リランキング閾値 */
  rerankThreshold: number;
}

type BasicChainInput = {
  chat_history: BaseMessage[];
  query: string;
};

// --- S3 Vectors 検索エージェント ---

class S3VectorsSearchAgent implements MetaSearchAgentType {
  private config: S3VectorsSearchConfig;
  private strParser = new StringOutputParser();

  constructor(config: S3VectorsSearchConfig) {
    this.config = config;
  }

  /**
   * 最適化モードに応じた検索パラメータを取得
   */
  private getSearchParams(optimizationMode: 'speed' | 'balanced' | 'quality') {
    switch (optimizationMode) {
      case 'speed':
        return { topK: 5, maxDocs: 5 };
      case 'balanced':
        return { topK: 10, maxDocs: 10 };
      case 'quality':
        return { topK: 15, maxDocs: 15 };
      default:
        return { topK: 10, maxDocs: 10 };
    }
  }

  /**
   * S3 Vectors で検索を実行 (共通ヘルパー)
   */
  private async executeSearch(
    query: string,
    topK: number,
  ): Promise<Document[]> {
    const searchOptions: SearchOptions = {
      topK,
      ...(this.config.category ? { category: this.config.category } : {}),
    };

    return searchArticles(query, searchOptions);
  }

  /**
   * 単一クエリ検索チェーン (speed / balanced)
   */
  private async createSearchRetrieverChain(
    llm: BaseChatModel,
    optimizationMode: 'speed' | 'balanced' | 'quality',
  ) {
    (llm as unknown as ChatOpenAI).temperature = 0;
    const { topK } = this.getSearchParams(optimizationMode);

    return RunnableSequence.from([
      ChatPromptTemplate.fromMessages([
        ['system', queryGeneratorPrompt],
        [
          'user',
          `
          <conversation>
          {chat_history}
          </conversation>

          <query>
          {query}
          </query>
          `,
        ],
      ]),
      llm,
      this.strParser,
      RunnableLambda.from(async (input: string) => {
        const questionOutputParser = new LineOutputParser({
          key: 'question',
        });

        let question = (await questionOutputParser.parse(input)) ?? input;

        if (question === 'not_needed') {
          return { query: '', docs: [] };
        }

        question = question.replace(/<think>.*?<\/think>/g, '');

        console.log(`[S3VectorsAgent] [${optimizationMode}] 検索: query="${question.slice(0, 80)}", topK=${topK}`);

        try {
          const documents = await this.executeSearch(question, topK);
          console.log(`[S3VectorsAgent] [${optimizationMode}] 結果: ${documents.length} 件`);
          return { query: question, docs: documents };
        } catch (error) {
          console.error('[S3VectorsAgent] Search failed:', error);
          return { query: question, docs: [] };
        }
      }),
    ]);
  }

  /**
   * マルチクエリ検索チェーン (quality モード)
   *
   * LLM が3つの異なる視点でクエリを生成し、
   * それぞれ S3 Vectors で検索して結果をマージ・重複排除する。
   */
  private async createMultiQuerySearchChain(
    llm: BaseChatModel,
  ) {
    (llm as unknown as ChatOpenAI).temperature = 0;
    const { topK } = this.getSearchParams('quality');

    return RunnableSequence.from([
      ChatPromptTemplate.fromMessages([
        ['system', multiQueryGeneratorPrompt],
        [
          'user',
          `
          <conversation>
          {chat_history}
          </conversation>

          <query>
          {query}
          </query>
          `,
        ],
      ]),
      llm,
      this.strParser,
      RunnableLambda.from(async (input: string) => {
        const cleaned = input.replace(/<think>.*?<\/think>/g, '');

        // 3つのクエリを抽出
        const q1Parser = new LineOutputParser({ key: 'question1' });
        const q2Parser = new LineOutputParser({ key: 'question2' });
        const q3Parser = new LineOutputParser({ key: 'question3' });

        const q1 = (await q1Parser.parse(cleaned)) ?? '';
        const q2 = (await q2Parser.parse(cleaned)) ?? '';
        const q3 = (await q3Parser.parse(cleaned)) ?? '';

        // 単一クエリフォールバック
        if (q1 === 'not_needed') {
          return { query: '', docs: [] };
        }

        const queries = [q1, q2, q3].filter((q) => q && q.length > 0);
        console.log(`[S3VectorsAgent] [quality] マルチクエリ生成: ${queries.length} 件`);
        queries.forEach((q, i) => console.log(`  Q${i + 1}: "${q.slice(0, 80)}"`));

        // 並行検索
        const searchResults = await Promise.all(
          queries.map((q) =>
            this.executeSearch(q, topK).catch((err) => {
              console.error(`[S3VectorsAgent] Query failed: "${q.slice(0, 40)}"`, err);
              return [] as Document[];
            }),
          ),
        );

        // マージ + 重複排除 (article_id ベース)
        const seen = new Set<string>();
        const mergedDocs: Document[] = [];

        for (const docs of searchResults) {
          for (const doc of docs) {
            const id = doc.metadata.article_id || doc.metadata.url;
            if (!seen.has(id)) {
              seen.add(id);
              mergedDocs.push(doc);
            }
          }
        }

        console.log(`[S3VectorsAgent] [quality] マージ結果: ${mergedDocs.length} 件 (重複排除済)`);

        return { query: q1, docs: mergedDocs };
      }),
    ]);
  }

  /**
   * 応答生成チェーン
   */
  private async createAnsweringChain(
    llm: BaseChatModel,
    fileIds: string[],
    embeddings: Embeddings,
    optimizationMode: 'speed' | 'balanced' | 'quality',
    systemInstructions: string,
  ) {
    return RunnableSequence.from([
      RunnableMap.from({
        systemInstructions: () => systemInstructions,
        query: (input: BasicChainInput) => input.query,
        chat_history: (input: BasicChainInput) => input.chat_history,
        date: () => new Date().toISOString(),
        context: RunnableLambda.from(async (input: BasicChainInput) => {
          const processedHistory = formatChatHistoryAsString(
            input.chat_history,
          );

          // 最適化モードに応じた検索チェーンを選択
          const searchRetrieverChain =
            optimizationMode === 'quality'
              ? await this.createMultiQuerySearchChain(llm)
              : await this.createSearchRetrieverChain(llm, optimizationMode);

          const searchRetrieverResult = await searchRetrieverChain.invoke({
            chat_history: processedHistory,
            query: input.query,
          });

          const query = searchRetrieverResult.query;
          const docs = searchRetrieverResult.docs as Document[];
          const { maxDocs } = this.getSearchParams(optimizationMode);

          if (docs.length === 0) {
            return docs;
          }

          // speed: S3 Vectors の距離順をそのまま使用 (リランキング不要)
          if (optimizationMode === 'speed') {
            return docs.slice(0, maxDocs);
          }

          // balanced / quality: LangChain Embeddings でリランキング
          const docsWithContent = docs.filter(
            (doc) => doc.pageContent && doc.pageContent.length > 0,
          );

          const [docEmbeddings, queryEmbedding] = await Promise.all([
            embeddings.embedDocuments(
              docsWithContent.map((doc) => doc.pageContent),
            ),
            embeddings.embedQuery(query),
          ]);

          const similarity = docEmbeddings.map((docEmbedding, i) => {
            const sim = computeSimilarity(queryEmbedding, docEmbedding);
            return { index: i, similarity: sim };
          });

          // quality モードではより厳密な閾値を適用
          const threshold =
            optimizationMode === 'quality'
              ? Math.max(this.config.rerankThreshold ?? 0.3, 0.2)
              : this.config.rerankThreshold ?? 0.3;

          const sortedDocs = similarity
            .filter((sim) => sim.similarity > threshold)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, maxDocs)
            .map((sim) => docsWithContent[sim.index]);

          console.log(`[S3VectorsAgent] [${optimizationMode}] リランキング後: ${sortedDocs.length} 件 (閾値=${threshold})`);

          return sortedDocs;
        })
          .withConfig({
            runName: 'FinalSourceRetriever',
          })
          .pipe(this.processDocs),
      }),
      ChatPromptTemplate.fromMessages([
        ['system', responsePrompt],
        new MessagesPlaceholder('chat_history'),
        ['user', '{query}'],
      ]),
      llm,
      this.strParser,
    ]).withConfig({
      runName: 'FinalResponseGenerator',
    });
  }

  /**
   * ドキュメントをコンテキスト文字列に変換
   */
  private processDocs(docs: Document[]) {
    return docs
      .map(
        (_, index) =>
          `${index + 1}. ${docs[index].metadata.title} (${docs[index].metadata.pub_date || ''}) ${docs[index].pageContent}`,
      )
      .join('\n');
  }

  /**
   * ストリーミングイベントを処理
   */
  private async handleStream(
    stream: AsyncGenerator<StreamEvent, any, any>,
    emitter: eventEmitter,
  ) {
    for await (const event of stream) {
      if (
        event.event === 'on_chain_end' &&
        event.name === 'FinalSourceRetriever'
      ) {
        emitter.emit(
          'data',
          JSON.stringify({ type: 'sources', data: event.data.output }),
        );
      }
      if (
        event.event === 'on_chain_stream' &&
        event.name === 'FinalResponseGenerator'
      ) {
        emitter.emit(
          'data',
          JSON.stringify({ type: 'response', data: event.data.chunk }),
        );
      }
      if (
        event.event === 'on_chain_end' &&
        event.name === 'FinalResponseGenerator'
      ) {
        emitter.emit('end');
      }
    }
  }

  /**
   * メイン処理: 検索 + 応答生成 (ストリーミング)
   */
  async searchAndAnswer(
    message: string,
    history: BaseMessage[],
    llm: BaseChatModel,
    embeddings: Embeddings,
    optimizationMode: 'speed' | 'balanced' | 'quality',
    fileIds: string[],
    systemInstructions: string,
  ) {
    const emitter = new eventEmitter();

    const answeringChain = await this.createAnsweringChain(
      llm,
      fileIds,
      embeddings,
      optimizationMode,
      systemInstructions,
    );

    const stream = answeringChain.streamEvents(
      {
        chat_history: history,
        query: message,
      },
      {
        version: 'v1',
      },
    );

    this.handleStream(stream, emitter);

    return emitter;
  }
}

export default S3VectorsSearchAgent;
