import MetaSearchAgent, { MetaSearchAgentType } from '@/lib/search/metaSearchAgent';
import S3VectorsSearchAgent from '@/lib/search/s3VectorsSearchAgent';
import prompts from '../prompts';

/**
 * フォーカスモード → 検索ハンドラーのマッピング
 *
 * PRNA 記事カテゴリ (finance, market, capital, real_estate, special, prnewswire)
 * は S3 Vectors セマンティック検索エージェントにルーティングする。
 * その他のモードは従来の MetaSearchAgent (SearxNG Web 検索) を使用。
 */
export const searchHandlers: Record<string, MetaSearchAgentType> = {
  // --- S3 Vectors 検索 (PRNA 記事セマンティック検索) ---
  finance: new S3VectorsSearchAgent({
    category: 'finance',
    topK: 10,
    rerank: true,
    rerankThreshold: 0.3,
  }),
  market: new S3VectorsSearchAgent({
    category: 'market',
    topK: 10,
    rerank: true,
    rerankThreshold: 0.3,
  }),
  capital: new S3VectorsSearchAgent({
    category: 'capital',
    topK: 10,
    rerank: true,
    rerankThreshold: 0.3,
  }),
  real_estate: new S3VectorsSearchAgent({
    category: 'real_estate',
    topK: 10,
    rerank: true,
    rerankThreshold: 0.3,
  }),
  special: new S3VectorsSearchAgent({
    category: 'special',
    topK: 10,
    rerank: true,
    rerankThreshold: 0.3,
  }),
  prnewswire: new S3VectorsSearchAgent({
    topK: 10,
    rerank: true,
    rerankThreshold: 0.3,
  }),

  // --- Web 検索 (従来の MetaSearchAgent) ---
  webSearch: new MetaSearchAgent({
    activeEngines: [],
    queryGeneratorPrompt: prompts.webSearchRetrieverPrompt,
    responsePrompt: prompts.webSearchResponsePrompt,
    queryGeneratorFewShots: prompts.webSearchRetrieverFewShots,
    rerank: true,
    rerankThreshold: 0.3,
    searchWeb: true,
  }),
  academicSearch: new MetaSearchAgent({
    activeEngines: ['arxiv', 'google scholar', 'pubmed'],
    queryGeneratorPrompt: prompts.webSearchRetrieverPrompt,
    responsePrompt: prompts.webSearchResponsePrompt,
    queryGeneratorFewShots: prompts.webSearchRetrieverFewShots,
    rerank: true,
    rerankThreshold: 0,
    searchWeb: true,
  }),
  writingAssistant: new MetaSearchAgent({
    activeEngines: [],
    queryGeneratorPrompt: '',
    queryGeneratorFewShots: [],
    responsePrompt: prompts.writingAssistantPrompt,
    rerank: true,
    rerankThreshold: 0,
    searchWeb: false,
  }),
  wolframAlphaSearch: new MetaSearchAgent({
    activeEngines: ['wolframalpha'],
    queryGeneratorPrompt: prompts.webSearchRetrieverPrompt,
    responsePrompt: prompts.webSearchResponsePrompt,
    queryGeneratorFewShots: prompts.webSearchRetrieverFewShots,
    rerank: false,
    rerankThreshold: 0,
    searchWeb: true,
  }),
  youtubeSearch: new MetaSearchAgent({
    activeEngines: ['youtube'],
    queryGeneratorPrompt: prompts.webSearchRetrieverPrompt,
    responsePrompt: prompts.webSearchResponsePrompt,
    queryGeneratorFewShots: prompts.webSearchRetrieverFewShots,
    rerank: true,
    rerankThreshold: 0.3,
    searchWeb: true,
  }),
  redditSearch: new MetaSearchAgent({
    activeEngines: ['reddit'],
    queryGeneratorPrompt: prompts.webSearchRetrieverPrompt,
    responsePrompt: prompts.webSearchResponsePrompt,
    queryGeneratorFewShots: prompts.webSearchRetrieverFewShots,
    rerank: true,
    rerankThreshold: 0.3,
    searchWeb: true,
  }),
};
