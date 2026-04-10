// src/adapters/built-in/pgvector/index.ts
// PGVector Built-in Adapter - 向量检索能力

export { PGVectorAdapter } from './adapter';
export { createBuiltInVectorSearchProvider, wrapPGVectorSearch } from './wrappers';
export type { PGVectorConfig } from './adapter';
