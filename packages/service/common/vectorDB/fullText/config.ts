import { serviceEnv } from '../../../env';
import { getVectorType } from '../constants';

/**
 * 显式选择全文读取位置；SQL 部署默认保持 Mongo 兼容读，Milvus 保留原生路径。
 * 原生全文与向量同行维护，不能指定另一个向量库，也不支持将 Milvus 改读未经回填的 Mongo。
 */
export const getFullTextProvider = () => {
  const vectorProvider = getVectorType();
  const provider =
    serviceEnv.DATASET_FULLTEXT_PROVIDER ?? (vectorProvider === 'milvus' ? 'milvus' : 'mongo');
  if (
    (provider !== 'mongo' && provider !== vectorProvider) ||
    (vectorProvider === 'milvus' && provider !== 'milvus')
  ) {
    throw new Error(
      `Full-text provider ${provider} is incompatible with vector provider ${vectorProvider}`
    );
  }
  return provider;
};

/**
 * SQL 词串始终与向量同行写入；双写开关只控制原生读期间的 Mongo 兼容写删。
 * 显式读 Mongo 时必须维护该主读存储，不能因关闭兼容双写而停止更新搜索结果。
 */
export const shouldWriteMongoFullText = () => {
  const provider = getFullTextProvider();
  return provider === 'mongo' || (provider !== 'milvus' && serviceEnv.DATASET_FULLTEXT_DUAL_WRITE);
};
