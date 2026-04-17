// src/adapters/built-in/mongodb/index.ts
// MongoDB Built-in Adapter - 全文检索能力

export { MongoDBAdapter } from './adapter';
export {
  createBuiltInFullTextSearchProvider,
  wrapMongoDBFullTextSearch,
  createMongoDBProvider
} from './wrappers';
export type { MongoDBConfig } from './adapter';
