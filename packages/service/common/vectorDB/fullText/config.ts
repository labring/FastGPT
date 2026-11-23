import { serviceEnv } from '../../../env';
import { getVectorType } from '../constants';

/**
 * 非 Milvus 部署开启兼容开关时读 Mongo，否则直接读当前向量库。
 * 管理员确认迁移成功后通过环境变量切读。
 */
export const getFullTextProvider = () => {
  const vectorProvider = getVectorType();
  return vectorProvider !== 'milvus' && serviceEnv.TMP_MIGRATE_FULL_TEXT
    ? 'legacy-mongo'
    : vectorProvider;
};

/**
 * 原生词串始终与向量同行写入；兼容模式同时维护 Mongo 全文写删。
 */
export const shouldWriteMongoFullText = () => getFullTextProvider() === 'legacy-mongo';
