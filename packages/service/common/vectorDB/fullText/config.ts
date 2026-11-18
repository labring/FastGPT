import { serviceEnv } from '../../../env';
import { getVectorType } from '../constants';

/**
 * SQL 部署只在设置临时兼容开关时固定读 Mongo，验收成功也不改变配置。
 * 关闭兼容后选择当前 SQL provider，实际读取还需等已验收目标就绪。
 */
export const getFullTextProvider = () => {
  const vectorProvider = getVectorType();
  return vectorProvider !== 'milvus' && serviceEnv.TMP_MIGRATE_FULL_TEXT ? 'mongo' : vectorProvider;
};

/**
 * SQL 词串始终与向量同行写入；兼容模式同时维护 Mongo 全文写删。
 */
export const shouldWriteMongoFullText = () => getFullTextProvider() === 'mongo';
