/**
 * 数据库适配器工厂
 */
import { DatabaseAdapter } from './base';
import { PgAdapter } from './pg';
import { OceanBaseAdapter } from './oceanbase';
import { MilvusAdapter } from './milvus';
import type { DatabaseConfig } from '../types';

export function createAdapter(config: DatabaseConfig): DatabaseAdapter {
  switch (config.type) {
    case 'pg':
      return new PgAdapter(config);
    case 'oceanbase':
      return new OceanBaseAdapter(config);
    case 'milvus':
      return new MilvusAdapter(config);
    default:
      throw new Error(`Unsupported database type: ${config.type}`);
  }
}

export { DatabaseAdapter } from './base';
export { PgAdapter } from './pg';
export { OceanBaseAdapter } from './oceanbase';
export { MilvusAdapter } from './milvus';
