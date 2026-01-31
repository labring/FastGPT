/**
 * Vector Database Integration Tests Index
 *
 * This module exports all vector database integration tests.
 * Each test file can be run independently or together.
 *
 * Environment variables required:
 * - PG: PG_URL
 * - OceanBase: OCEANBASE_URL
 * - Milvus: MILVUS_ADDRESS, MILVUS_TOKEN
 */

// Re-export all test modules
// Each module will be run when included in vitest configuration

export { default as PgVectorTests } from './pg/test_pg.test';
export { default as OceanBaseTests } from './oceanbase/test_oceanbase.test';
export { default as MilvusTests } from './milvus/test_milvus.test';

// Export test utilities
export * from './utils/testData';
export * from './utils/helper';
