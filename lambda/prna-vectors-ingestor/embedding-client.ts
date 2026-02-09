/**
 * Embedding 生成クライアント
 *
 * 採用モデル: Gemini gemini-embedding-001 (3072 次元)
 *   - MTEB Multilingual リーダーボード最高スコア (68.32)
 *   - 100+ 言語対応、日本語金融ニュースに最適
 *   - Matryoshka 対応: 3072 / 1536 / 768 次元に縮小可能
 *
 * 環境変数:
 *   EMBEDDING_PROVIDER  — 'gemini' (デフォルト) | 'bedrock'
 *   EMBEDDING_API_KEY   — Gemini API キー
 *   EMBEDDING_DIMENSION — 出力次元数 (デフォルト: 3072)
 */

/**
 * 環境変数を遅延評価で取得 (バックフィルスクリプトからの利用を考慮)
 */
function getConfig() {
  return {
    provider: process.env.EMBEDDING_PROVIDER || 'gemini',
    apiKey: process.env.EMBEDDING_API_KEY || '',
    dimension: parseInt(process.env.EMBEDDING_DIMENSION || '3072'),
  };
}

/**
 * テキストの Embedding ベクトルを生成
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('Embedding text must not be empty');
  }

  const config = getConfig();

  switch (config.provider) {
    case 'gemini':
      return generateGeminiEmbedding(text, config.apiKey, config.dimension);
    case 'bedrock':
      return generateBedrockEmbedding(text);
    default:
      throw new Error(`Unsupported embedding provider: ${config.provider}`);
  }
}

/**
 * Gemini gemini-embedding-001 で Embedding 生成
 */
async function generateGeminiEmbedding(
  text: string,
  apiKey: string,
  dimension: number
): Promise<number[]> {
  if (!apiKey) {
    throw new Error('EMBEDDING_API_KEY is not set');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/gemini-embedding-001',
      content: { parts: [{ text }] },
      outputDimensionality: dimension,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Gemini Embedding API error: ${response.status} ${errorText}`
    );
  }

  const data = (await response.json()) as {
    embedding?: { values?: number[] };
  };

  if (!data.embedding?.values || !Array.isArray(data.embedding.values)) {
    throw new Error(
      `Unexpected Gemini response: ${JSON.stringify(data).slice(0, 200)}`
    );
  }

  return data.embedding.values;
}

/**
 * Amazon Bedrock Titan Text Embeddings V2 で Embedding 生成 (将来の切替用)
 *
 * 使用時は @aws-sdk/client-bedrock-runtime を dependencies に追加すること
 */
async function generateBedrockEmbedding(_text: string): Promise<number[]> {
  // Bedrock 対応は Phase 2 以降で実装
  // @aws-sdk/client-bedrock-runtime を追加した際にコメントアウトを解除
  throw new Error(
    'Bedrock embedding provider is not yet implemented. Use EMBEDDING_PROVIDER=gemini'
  );
}
