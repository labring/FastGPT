// src/config/loader.ts
// Configuration Loader - 加载 .env 和 config.yaml，环境变量优先
// 兼容 Python 版 (.env) 和 TypeScript 版的环境变量

import * as fs from 'fs/promises';
import * as yaml from 'js-yaml';
import * as dotenv from 'dotenv';
import type {
  Config,
  LLMConfig,
  EmbeddingConfig,
  RerankerConfig,
  VectorDBConfig,
  FullTextDBConfig,
  FastGPTConfig,
  AgentConfig
} from './schema';
import {
  getDefaultLLM,
  getDefaultEmbedding,
  getDefaultReranker,
  getDefaultAgent,
  getDefaultPGVector,
  getDefaultMilvus,
  getDefaultMongoDB,
  getDefaultFastGPT
} from './settings';

/**
 * 从环境变量加载 LLM 配置
 */
function loadLLMFromEnv(): LLMConfig {
  const defaults = getDefaultLLM();
  return {
    base_url: defaults.BASE_URL,
    api_key: defaults.API_KEY,
    model: defaults.MODEL,
    max_tokens: defaults.MAX_TOKENS,
    timeout: defaults.TIMEOUT
  };
}

/**
 * 从环境变量加载 Embedding 配置
 */
function loadEmbeddingFromEnv(): EmbeddingConfig {
  const defaults = getDefaultEmbedding();
  return {
    base_url: defaults.BASE_URL,
    api_key: defaults.API_KEY,
    model: defaults.MODEL,
    dimension: defaults.DIMENSION,
    timeout: defaults.TIMEOUT
  };
}

/**
 * 从环境变量加载 Reranker 配置
 */
function loadRerankerFromEnv(): RerankerConfig | undefined {
  const defaults = getDefaultReranker();
  if (!defaults) {
    return undefined;
  }
  return {
    base_url: defaults.BASE_URL,
    api_key: defaults.API_KEY,
    model: defaults.MODEL,
    top_n: defaults.TOP_N,
    timeout: defaults.TIMEOUT
  };
}

/**
 * 从环境变量加载向量数据库配置
 */
function loadVectorDBFromEnv(): VectorDBConfig {
  const type = (process.env.VECTOR_DB as 'pgvector' | 'milvus') || 'pgvector';
  const pg = getDefaultPGVector();
  const milvus = getDefaultMilvus();

  if (type === 'pgvector') {
    return {
      type: 'pgvector',
      pg_url: process.env.PG_URL || pg.URL,
      pg_host: process.env.PG_HOST || pg.HOST,
      pg_port: parseInt(process.env.PG_PORT || '', 10) || pg.PORT,
      pg_database: process.env.PG_DATABASE || pg.DATABASE,
      pg_user: process.env.PG_USER || pg.USER,
      pg_password: process.env.PG_PASSWORD || pg.PASSWORD,
      milvus_database: milvus.DATABASE
    };
  } else {
    return {
      type: 'milvus',
      pg_host: pg.HOST,
      pg_port: pg.PORT,
      pg_database: pg.DATABASE,
      pg_user: pg.USER,
      pg_password: pg.PASSWORD,
      milvus_address: process.env.MILVUS_ADDRESS || milvus.ADDRESS,
      milvus_token: process.env.MILVUS_TOKEN || milvus.TOKEN,
      milvus_database: process.env.MILVUS_DATABASE || milvus.DATABASE
    };
  }
}

/**
 * 从环境变量加载全文检索数据库配置
 */
function loadFullTextDBFromEnv(): FullTextDBConfig {
  const type = (process.env.FULLTEXT_DB as 'mongodb' | 'opensearch') || 'mongodb';
  const mongodb = getDefaultMongoDB();

  return {
    type,
    url: process.env.MONGODB_URL || mongodb.URL,
    database: process.env.MONGODB_DATABASE || mongodb.DATABASE
  };
}

/**
 * 从环境变量加载 FastGPT 配置
 */
function loadFastGPTFromEnv(): FastGPTConfig | undefined {
  const defaults = getDefaultFastGPT();
  if (!defaults.BASE_URL || defaults.BASE_URL === 'http://fastgpt.default:3000') {
    // 只有当 FASTGPT_API_BASE 明确配置时才启用
    if (!process.env.FASTGPT_API_BASE && !process.env.FASTGPT_API_KEY) {
      return undefined;
    }
  }
  return {
    base_url: process.env.FASTGPT_API_BASE || defaults.BASE_URL,
    api_key: process.env.FASTGPT_API_KEY || defaults.API_KEY
  };
}

/**
 * 从环境变量加载 Agent 配置
 */
function loadAgentFromEnv(): AgentConfig {
  const defaults = getDefaultAgent();
  return {
    search_mode: defaults.SEARCH_MODE,
    max_search_rounds: defaults.MAX_SEARCH_ROUNDS,
    max_tool_calls: defaults.MAX_TOOL_CALLS,
    embedding_weight: defaults.EMBEDDING_WEIGHT,
    similarity: defaults.SIMILARITY,
    rerank_top_k: defaults.RERANK_TOP_K,
    retrieve_limit: defaults.RETRIEVE_LIMIT
  };
}

/**
 * 从 YAML 文件加载配置
 */
async function loadFromYAML(filePath: string): Promise<Partial<Config>> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return yaml.load(content) as Partial<Config>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`Failed to load YAML config from ${filePath}:`, error);
    }
    return {};
  }
}

/**
 * 深度合并对象
 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key in source) {
    if (source[key] !== undefined) {
      if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
        result[key] = deepMerge(
          (result[key] as Record<string, unknown>) || {},
          source[key] as Record<string, unknown>
        ) as T[Extract<keyof T, string>];
      } else {
        result[key] = source[key] as T[Extract<keyof T, string>];
      }
    }
  }
  return result;
}

/**
 * 加载配置
 * 优先级: YAML > 环境变量 > 默认值
 */
export async function loadConfig(configFile?: string): Promise<Config> {
  // 加载 .env
  dotenv.config();

  // 基础配置（环境变量覆盖默认值）
  const baseConfig: Config = {
    llm: loadLLMFromEnv(),
    embedding: loadEmbeddingFromEnv(),
    reranker: loadRerankerFromEnv(),
    vector_db: loadVectorDBFromEnv(),
    fulltext_db: loadFullTextDBFromEnv(),
    fastgpt: loadFastGPTFromEnv(),
    agent: loadAgentFromEnv()
  };

  // 加载 YAML 配置
  const yamlConfig = configFile
    ? await loadFromYAML(configFile)
    : await loadFromYAML('./config.yaml');

  // 合并配置 (YAML > env)
  let merged = baseConfig;
  if (yamlConfig.llm) merged = deepMerge(merged, { llm: yamlConfig.llm } as Partial<Config>);
  if (yamlConfig.embedding)
    merged = deepMerge(merged, { embedding: yamlConfig.embedding } as Partial<Config>);
  if (yamlConfig.reranker)
    merged = deepMerge(merged, { reranker: yamlConfig.reranker } as Partial<Config>);
  if (yamlConfig.vector_db)
    merged = deepMerge(merged, { vector_db: yamlConfig.vector_db } as Partial<Config>);
  if (yamlConfig.fulltext_db)
    merged = deepMerge(merged, { fulltext_db: yamlConfig.fulltext_db } as Partial<Config>);
  if (yamlConfig.fastgpt)
    merged = deepMerge(merged, { fastgpt: yamlConfig.fastgpt } as Partial<Config>);
  if (yamlConfig.agent) merged = deepMerge(merged, { agent: yamlConfig.agent } as Partial<Config>);

  return merged;
}

/**
 * 从配置创建 Provider 所需的参数
 */
export function createProviderConfig(config: Config) {
  return {
    llm: {
      endpoint: config.llm.base_url,
      apiKey: config.llm.api_key,
      model: config.llm.model,
      timeout: config.llm.timeout
    },
    embed: {
      endpoint: config.embedding.base_url,
      apiKey: config.embedding.api_key,
      model: config.embedding.model,
      dimension: config.embedding.dimension,
      timeout: config.embedding.timeout
    },
    reranker: config.reranker
      ? {
          endpoint: config.reranker.base_url,
          apiKey: config.reranker.api_key,
          model: config.reranker.model,
          topN: config.reranker.top_n,
          timeout: config.reranker.timeout
        }
      : undefined,
    vectorSearch:
      config.vector_db.type === 'pgvector'
        ? {
            connectionString: config.vector_db.pg_url,
            host: config.vector_db.pg_host,
            port: config.vector_db.pg_port,
            database: config.vector_db.pg_database,
            user: config.vector_db.pg_user,
            password: config.vector_db.pg_password
          }
        : {
            address: config.vector_db.milvus_address || 'localhost:19530',
            token: config.vector_db.milvus_token,
            database: config.vector_db.milvus_database
          },
    fullTextSearch: {
      url: config.fulltext_db.url,
      database: config.fulltext_db.database
    },
    fastgpt: config.fastgpt
      ? {
          baseUrl: config.fastgpt.base_url,
          apiKey: config.fastgpt.api_key
        }
      : undefined,
    agent: {
      searchMode: config.agent.search_mode,
      maxSearchRounds: config.agent.max_search_rounds,
      maxToolCalls: config.agent.max_tool_calls,
      embeddingWeight: config.agent.embedding_weight,
      similarity: config.agent.similarity,
      rerankTopK: config.agent.rerank_top_k,
      retrieveLimit: config.agent.retrieve_limit
    }
  };
}
