// src/adapters/built-in/milvus/index.ts
// Milvus Built-in Adapter - 向量检索能力

export { MilvusAdapter } from './adapter';
export { createMilvusProvider, wrapMilvusVectorSearch } from './wrappers';
export type { MilvusConfig } from './adapter';
