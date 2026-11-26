import { getLogger, LogCategories } from '../../../common/logger';
import { getSystemInstanceConfig } from '../../../common/system/systemInstanceConfig/runtime';
import { configureLLMRequestRecordTTLIndex, MongoLLMRequestRecord } from './schema';

const logger = getLogger(LogCategories.MODULE.AI);

/**
 * 同步校准日志 TTL 索引（失败直接抛错，供配置保存事务在提交前强一致执行）：
 * 仅调整 FastGPT 原有 createdAt_1 TTL 索引：缺失时补建，值变化时使用 collMod，
 * 不删除或重建已有索引，也不改动同名但 key 不符或非 TTL 的客户索引。
 */
export const applyLLMRequestRecordTTL = async ({
  retentionHours = getSystemInstanceConfig().performance.tracking.retentionHours,
  maxTimeMS
}: {
  retentionHours?: number;
  maxTimeMS?: number;
} = {}): Promise<void> => {
  const expireAfterSeconds = retentionHours * 60 * 60;
  if (
    !Number.isSafeInteger(expireAfterSeconds) ||
    expireAfterSeconds <= 0 ||
    expireAfterSeconds > 2_147_483_647
  ) {
    throw new Error('LLM request record retention exceeds the supported TTL range');
  }

  const model = MongoLLMRequestRecord;
  const timeoutOption = maxTimeMS !== undefined ? { maxTimeMS } : undefined;
  const indexes = await (
    timeoutOption ? model.collection.indexes(timeoutOption) : model.collection.indexes()
  ).catch((error: unknown) => {
    // 首次启动还没有日志集合时，交给 createIndex 同时建立集合和 TTL 索引。
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 26) {
      return [];
    }
    throw error;
  });
  const current = indexes.find((index) => index.name === 'createdAt_1');

  if (!current) {
    await model.collection.createIndex(
      { createdAt: 1 },
      { name: 'createdAt_1', expireAfterSeconds, ...timeoutOption }
    );
    configureLLMRequestRecordTTLIndex(expireAfterSeconds);
    return;
  }

  if (
    Object.keys(current.key).length !== 1 ||
    current.key.createdAt !== 1 ||
    typeof current.expireAfterSeconds !== 'number'
  ) {
    throw new Error('LLM request record createdAt_1 is not the expected TTL index');
  }
  if (current.expireAfterSeconds === expireAfterSeconds) {
    configureLLMRequestRecordTTLIndex(expireAfterSeconds);
    return;
  }

  const database = model.db.db;
  if (!database) throw new Error('LLM request record database is not connected');

  // 使用日志 Model 所属数据库，兼容 MONGODB_LOG_URI 与主库分离的部署。
  await database.command({
    collMod: model.collection.collectionName,
    index: { name: current.name, expireAfterSeconds },
    ...timeoutOption
  });
  configureLLMRequestRecordTTLIndex(expireAfterSeconds);
};

/**
 * 启动校准日志 TTL，作用于集合内全部新旧记录。
 * 失败只记录业务应用错误并返回 false，不阻断服务启动。
 */
export const refreshLLMRequestRecordTTL = async (): Promise<boolean> => {
  try {
    await applyLLMRequestRecordTTL();
    return true;
  } catch (error) {
    logger.error('Failed to apply LLM request record TTL', { error });
    return false;
  }
};
