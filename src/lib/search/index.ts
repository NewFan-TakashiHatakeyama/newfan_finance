import { MetaSearchAgentType } from '@/lib/search/metaSearchAgent';
import S3VectorsSearchAgent from '@/lib/search/s3VectorsSearchAgent';

/**
 * フォーカスモード → 検索ハンドラーのマッピング
 *
 * 全モードで S3 Vectors セマンティック検索エージェントを使用。
 * カテゴリ別モード (finance, market 等) は該当カテゴリでフィルタリング。
 * prnewswire モード (デフォルト) はカテゴリフィルタなしで全記事を検索。
 */
export const searchHandlers: Record<string, MetaSearchAgentType> = {
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
};
