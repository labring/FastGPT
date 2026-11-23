import { getVectorType } from '../constants';
import { mongoFullTextAdapter } from '../mongo/fullText';
import { getSqlFullTextAdapter } from './controller';
import type { NativeFullTextAdapter } from './type';

/** Mongo 和 SQL 共享行级全文迁移和查询契约，Milvus 保留独立实现。 */
export const getNativeFullTextAdapter = (): NativeFullTextAdapter =>
  getVectorType() === 'mongo' ? mongoFullTextAdapter : getSqlFullTextAdapter();
