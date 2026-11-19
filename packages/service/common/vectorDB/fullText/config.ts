import { serviceEnv } from '../../../env';
import { getVectorType } from '../constants';

/**
 * SQL 部署开启兼容开关时读 Mongo，否则直接读当前 SQL 向量库。
 * 管理员确认迁移成功后通过环境变量切读。
 */
export const getFullTextProvider = () => {
  const vectorProvider = getVectorType();
  return vectorProvider !== 'milvus' && serviceEnv.TMP_MIGRATE_FULL_TEXT ? 'mongo' : vectorProvider;
};

/**
 * SQL 词串始终与向量同行写入；兼容模式同时维护 Mongo 全文写删。
 */
export const shouldWriteMongoFullText = () => getFullTextProvider() === 'mongo';
