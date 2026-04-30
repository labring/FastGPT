// src/config/settings.ts
// Global default settings - 支持从环境变量覆盖

/**
 * 获取默认 LLM 设置（环境变量覆盖默认值）
 * 兼容: LLM_BASE_URL, LLM_MODEL, LLM_API_KEY, LLM_MAX_TOKENS, LLM_TIMEOUT
 * 兼容: OPENAI_BASE_URL, OPENAI_API_KEY
 */
export function getDefaultLLM() {
  const baseUrl =
    process.env.LLM_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    'http://fastgpt-aiproxy.default:3000/v1';
  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
  const model = process.env.LLM_MODEL || 'Qwen3-Next-80B-A3B-Instruct-FP8';

  return {
    BASE_URL: baseUrl,
    MODEL: model,
    MAX_TOKENS: parseInt(process.env.LLM_MAX_TOKENS || '', 10) || 8192,
    TIMEOUT: parseInt(process.env.LLM_TIMEOUT || '', 10) || 120000,
    API_KEY: apiKey
  };
}

/**
 * 获取默认 Embedding 设置
 * 兼容: EMBEDDING_BASE_URL, EMBEDDING_MODEL, EMBEDDING_API_KEY
 */
export function getDefaultEmbedding() {
  const baseUrl = process.env.EMBEDDING_BASE_URL || 'http://fastgpt-aiproxy.default:3000/v1';
  const apiKey = process.env.EMBEDDING_API_KEY;
  const model = process.env.EMBEDDING_MODEL || 'bge-m3';

  return {
    BASE_URL: baseUrl,
    MODEL: model,
    DIMENSION: parseInt(process.env.EMBEDDING_DIMENSION || '', 10) || 1024,
    TIMEOUT: parseInt(process.env.EMBEDDING_TIMEOUT || '', 10) || 60000,
    API_KEY: apiKey
  };
}

/**
 * 获取默认 Reranker 设置
 * 兼容: RERANKER_BASE_URL, RERANKER_MODEL, RERANKER_API_KEY, RERANKER_TOP_K
 */
export function getDefaultReranker():
  | { BASE_URL: string; MODEL: string; TOP_N: number; TIMEOUT: number; API_KEY?: string }
  | undefined {
  const hasConfig =
    process.env.RERANKER_BASE_URL || process.env.RERANKER_MODEL || process.env.RERANKER_API_KEY;

  if (!hasConfig) {
    return undefined;
  }

  return {
    BASE_URL: process.env.RERANKER_BASE_URL || 'http://fastgpt-aiproxy.default:3000/v1',
    MODEL: process.env.RERANKER_MODEL || 'bge-reranker-large',
    TOP_N: parseInt(process.env.RERANKER_TOP_K || '', 10) || 20,
    TIMEOUT: parseInt(process.env.RERANKER_TIMEOUT || '', 10) || 60000,
    API_KEY: process.env.RERANKER_API_KEY
  };
}

/**
 * 获取默认 PGVector 设置
 */
export function getDefaultPGVector() {
  return {
    HOST: process.env.PG_HOST || 'fastgpt-pgvector.default',
    PORT: parseInt(process.env.PG_PORT || '', 10) || 5432,
    DATABASE: process.env.PG_DATABASE || 'postgres',
    USER: process.env.PG_USER || 'postgres',
    PASSWORD: process.env.PG_PASSWORD || 'password',
    TABLE_NAME: process.env.PG_TABLE_NAME || 'dataset_vectors',
    VECTOR_DIMENSION: parseInt(process.env.PG_VECTOR_DIMENSION || '', 10) || 1536,
    URL: process.env.PG_URL
  };
}

/**
 * 获取默认 Milvus 设置
 */
export function getDefaultMilvus() {
  return {
    ADDRESS: process.env.MILVUS_ADDRESS || 'localhost:19530',
    DATABASE: process.env.MILVUS_DATABASE || 'default',
    COLLECTION_NAME: process.env.MILVUS_COLLECTION || 'dataset_vectors',
    VECTOR_DIMENSION: parseInt(process.env.MILVUS_VECTOR_DIMENSION || '', 10) || 1536,
    TOKEN: process.env.MILVUS_TOKEN
  };
}

/**
 * 获取默认 MongoDB 设置
 * 兼容: MONGODB_URL, MONGODB_DATABASE
 */
export function getDefaultMongoDB() {
  return {
    URL: process.env.MONGODB_URL || 'mongodb://fastgpt-mongodb.default:27017',
    DATABASE: process.env.MONGODB_DATABASE || 'fastgpt'
  };
}

export function getDefaultAgent() {
  return {
    SEARCH_MODE:
      (process.env.AGENTIC_SEARCH_MODE as 'embedding' | 'fullTextRecall' | 'mixedRecall') ||
      'mixedRecall',
    MAX_SEARCH_ROUNDS: parseInt(process.env.AGENTIC_MAX_SEARCH_ROUNDS || '', 10) || 50,
    MAX_TOOL_CALLS: parseInt(process.env.AGENTIC_MAX_TOOL_CALLS || '', 10) || 100,
    EMBEDDING_WEIGHT: parseFloat(process.env.AGENTIC_EMBEDDING_WEIGHT || '') || 0.6,
    SIMILARITY: parseFloat(process.env.AGENTIC_SIMILARITY || '') || 0.0,
    RERANK_TOP_K: parseInt(process.env.AGENTIC_RERANK_TOP_K || '', 10) || 20,
    RETRIEVE_LIMIT: parseInt(process.env.AGENTIC_RETRIEVE_LIMIT || '', 10) || 50
  };
}

/**
 * 获取 FastGPT 配置（用于检索）
 */
export function getDefaultFastGPT() {
  return {
    BASE_URL:
      process.env.FASTGPT_API_BASE || process.env.FASTGPT_BASE_URL || 'http://fastgpt.default:3000',
    API_KEY: process.env.FASTGPT_API_KEY
  };
}
