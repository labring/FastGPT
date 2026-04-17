// src/config/schema.ts
// Configuration Schema - 使用 zod 定义配置验证

import { z } from 'zod';

/**
 * LLM 配置
 */
export const LLMConfigSchema = z.object({
  base_url: z.string().url().default('http://fastgpt-aiproxy.default:3000/v1'),
  api_key: z.string().optional(),
  model: z.string().default('Qwen3-Next-80B-A3B-Instruct-FP8'),
  max_tokens: z.number().positive().default(8192),
  timeout: z.number().positive().default(120000)
});

export type LLMConfig = z.infer<typeof LLMConfigSchema>;

/**
 * Embedding 配置
 */
export const EmbeddingConfigSchema = z.object({
  base_url: z.string().url().default('http://fastgpt-aiproxy.default:3000/v1'),
  api_key: z.string().optional(),
  model: z.string().default('bge-m3'),
  dimension: z.number().positive().default(1024),
  timeout: z.number().positive().default(60000)
});

export type EmbeddingConfig = z.infer<typeof EmbeddingConfigSchema>;

/**
 * Reranker 配置
 */
export const RerankerConfigSchema = z.object({
  base_url: z.string().url().default('http://fastgpt-aiproxy.default:3000/v1'),
  api_key: z.string().optional(),
  model: z.string().default('bge-reranker-large'),
  top_n: z.number().positive().default(10),
  timeout: z.number().positive().default(60000)
});

export type RerankerConfig = z.infer<typeof RerankerConfigSchema>;

/**
 * 向量数据库配置
 */
export const VectorDBConfigSchema = z.object({
  type: z.enum(['pgvector', 'milvus']).default('pgvector'),
  // PGVector 配置
  pg_url: z.string().optional(),
  pg_host: z.string().default('localhost'),
  pg_port: z.number().positive().default(5432),
  pg_database: z.string().default('postgres'),
  pg_user: z.string().default('postgres'),
  pg_password: z.string().default('password'),
  // Milvus 配置
  milvus_address: z.string().optional(),
  milvus_token: z.string().optional(),
  milvus_database: z.string().default('default')
});

export type VectorDBConfig = z.infer<typeof VectorDBConfigSchema>;

/**
 * 全文检索数据库配置
 */
export const FullTextDBConfigSchema = z.object({
  type: z.enum(['mongodb', 'opensearch']).default('mongodb'),
  // MongoDB 配置
  url: z.string().default('mongodb://localhost:27017'),
  database: z.string().default('fastgpt')
  // OpenSearch 配置 (预留)
  // opensearch_url: z.string().optional(),
  // opensearch_index: z.string().optional(),
});

export type FullTextDBConfig = z.infer<typeof FullTextDBConfigSchema>;

/**
 * FastGPT 配置（检索服务）
 */
export const FastGPTConfigSchema = z.object({
  base_url: z.string().default('http://localhost:3000'),
  api_key: z.string().optional()
});

export type FastGPTConfig = z.infer<typeof FastGPTConfigSchema>;

/**
 * Agent 配置
 */
export const AgentConfigSchema = z.object({
  search_mode: z.enum(['embedding', 'fullTextRecall', 'mixedRecall']).default('mixedRecall'),
  max_search_rounds: z.number().positive().default(5),
  max_tool_calls: z.number().positive().default(10),
  embedding_weight: z.number().min(0).max(1).default(0.5),
  similarity: z.number().min(0).max(1).default(0.0),
  rerank_top_k: z.number().positive().default(20)
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/**
 * 完整配置
 */
export const ConfigSchema = z.object({
  llm: LLMConfigSchema.default(LLMConfigSchema.parse({})),
  embedding: EmbeddingConfigSchema.default(EmbeddingConfigSchema.parse({})),
  reranker: RerankerConfigSchema.optional(),
  vector_db: VectorDBConfigSchema.default(VectorDBConfigSchema.parse({})),
  fulltext_db: FullTextDBConfigSchema.default(FullTextDBConfigSchema.parse({})),
  fastgpt: FastGPTConfigSchema.optional(),
  agent: AgentConfigSchema.default(AgentConfigSchema.parse({}))
});

export type Config = z.infer<typeof ConfigSchema>;
