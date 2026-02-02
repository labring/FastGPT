/**
 * Vector Database Migration Module
 *
 * This module provides functionality to migrate vector data between different
 * vector databases supported by FastGPT (PostgreSQL, OceanBase, Milvus).
 *
 * Usage:
 * ```typescript
 * import { startMigration } from '@fastgpt/service/common/vectorDB/migration';
 *
 * const result = await startMigration({
 *   mode: 'offline',
 *   sourceType: 'pg',
 *   targetType: 'milvus',
 *   targetConfig: {
 *     type: 'milvus',
 *     address: 'http://localhost:19530'
 *   }
 * });
 * ```
 */

export * from './type';
export * from './controller';
export { createExporter } from './exporters';
export { createImporter } from './importers';
