import toml from '@iarna/toml';

// Use dynamic imports for Node.js modules to prevent client-side errors
let fs: any;
let path: any;
if (typeof window === 'undefined') {
  // We're on the server
  fs = require('fs');
  path = require('path');
}

const configFileName = 'config.toml';

interface Config {
  GENERAL: {
    SIMILARITY_MEASURE: string;
    KEEP_ALIVE: string;
  };
  MODELS: {
    OPENAI: {
      API_KEY: string;
    };
    GROQ: {
      API_KEY: string;
    };
    ANTHROPIC: {
      API_KEY: string;
    };
    GEMINI: {
      API_KEY: string;
    };
    OLLAMA: {
      API_URL: string;
      API_KEY: string;
    };
    DEEPSEEK: {
      API_KEY: string;
    };
    AIMLAPI: {
      API_KEY: string;
    };
    LM_STUDIO: {
      API_URL: string;
    };
    LEMONADE: {
      API_URL: string;
      API_KEY: string;
    };
    CUSTOM_OPENAI: {
      API_URL: string;
      API_KEY: string;
      MODEL_NAME: string;
    };
  };
  API_ENDPOINTS: {
    SEARXNG: string;
  };
}

type RecursivePartial<T> = {
  [P in keyof T]?: RecursivePartial<T[P]>;
};

const loadConfig = () => {
  // Server-side only
  if (typeof window === 'undefined') {
    const configPath = path.join(process.cwd(), configFileName);
    if (fs.existsSync(configPath)) {
      return toml.parse(
        fs.readFileSync(configPath, 'utf-8'),
      ) as any as Config;
    }
  }

  // Client-side fallback or if config.toml doesn't exist on server
  return {
    GENERAL: {
      SIMILARITY_MEASURE: 'cosine',
      KEEP_ALIVE: '5m',
    },
    MODELS: {
      OPENAI: { API_KEY: '' },
      GROQ: { API_KEY: '' },
      ANTHROPIC: { API_KEY: '' },
      GEMINI: { API_KEY: '' },
      OLLAMA: { API_URL: '', API_KEY: '' },
      DEEPSEEK: { API_KEY: '' },
      AIMLAPI: { API_KEY: '' },
      LM_STUDIO: { API_URL: '' },
      LEMONADE: { API_URL: '', API_KEY: '' },
      CUSTOM_OPENAI: { API_URL: '', API_KEY: '', MODEL_NAME: '' },
    },
    API_ENDPOINTS: {
      SEARXNG: '',
    },
  } as Config;
};

export const getSimilarityMeasure = () =>
  loadConfig().GENERAL.SIMILARITY_MEASURE;

export const getKeepAlive = () => loadConfig().GENERAL.KEEP_ALIVE;

export const getOpenaiApiKey = () =>
  process.env.OPENAI_API_KEY || loadConfig().MODELS.OPENAI.API_KEY;

export const getGroqApiKey = () =>
  process.env.GROQ_API_KEY || loadConfig().MODELS.GROQ.API_KEY;

export const getAnthropicApiKey = () =>
  process.env.ANTHROPIC_API_KEY || loadConfig().MODELS.ANTHROPIC.API_KEY;

export const getGeminiApiKey = () => {
  // GEMINI_API_KEY または GOOGLE_API_KEY または config.toml から取得
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || loadConfig().MODELS.GEMINI.API_KEY;
  
  // デバッグログ（本番環境では削除推奨）
  if (typeof window === 'undefined') {
    console.log('[Config] Gemini API Key loaded:', {
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey?.length || 0,
      source: process.env.GEMINI_API_KEY ? 'GEMINI_API_KEY' : process.env.GOOGLE_API_KEY ? 'GOOGLE_API_KEY' : 'config.toml',
    });
  }
  
  return apiKey;
};

export const getSearxngApiEndpoint = () =>
  process.env.SEARXNG_API_URL || loadConfig().API_ENDPOINTS.SEARXNG;

export const getOllamaApiEndpoint = () =>
  process.env.OLLAMA_API_URL || loadConfig().MODELS.OLLAMA.API_URL;

export const getOllamaApiKey = () =>
  process.env.OLLAMA_API_KEY || loadConfig().MODELS.OLLAMA.API_KEY;

export const getDeepseekApiKey = () =>
  process.env.DEEPSEEK_API_KEY || loadConfig().MODELS.DEEPSEEK.API_KEY;

export const getAimlApiKey = () =>
  process.env.AIML_API_KEY || loadConfig().MODELS.AIMLAPI.API_KEY;

export const getCustomOpenaiApiKey = () =>
  process.env.CUSTOM_OPENAI_API_KEY ||
  loadConfig().MODELS.CUSTOM_OPENAI.API_KEY;

export const getCustomOpenaiApiUrl = () =>
  process.env.CUSTOM_OPENAI_API_URL ||
  loadConfig().MODELS.CUSTOM_OPENAI.API_URL;

export const getCustomOpenaiModelName = () =>
  process.env.CUSTOM_OPENAI_MODEL_NAME ||
  loadConfig().MODELS.CUSTOM_OPENAI.MODEL_NAME;

export const getLMStudioApiEndpoint = () =>
  process.env.LM_STUDIO_API_URL || loadConfig().MODELS.LM_STUDIO.API_URL;

export const getLemonadeApiEndpoint = () =>
  process.env.LEMONADE_API_URL || loadConfig().MODELS.LEMONADE.API_URL;

export const getLemonadeApiKey = () =>
  process.env.LEMONADE_API_KEY || loadConfig().MODELS.LEMONADE.API_KEY;

const mergeConfigs = (current: any, update: any): any => {
  if (update === null || update === undefined) {
    return current;
  }

  if (typeof current !== 'object' || current === null) {
    return update;
  }

  const result = { ...current };

  for (const key in update) {
    if (Object.prototype.hasOwnProperty.call(update, key)) {
      const updateValue = update[key];

      if (
        typeof updateValue === 'object' &&
        updateValue !== null &&
        typeof result[key] === 'object' &&
        result[key] !== null
      ) {
        result[key] = mergeConfigs(result[key], updateValue);
      } else if (updateValue !== undefined) {
        result[key] = updateValue;
      }
    }
  }

  return result;
};

export const updateConfig = (config: RecursivePartial<Config>) => {
  // Server-side only, and not on Vercel
  if (typeof window === 'undefined' && !process.env.VERCEL) {
    const currentConfig = loadConfig();
    const mergedConfig = mergeConfigs(currentConfig, config);
    fs.writeFileSync(
      path.join(process.cwd(), `${configFileName}`),
      toml.stringify(mergedConfig),
    );
  }
};
