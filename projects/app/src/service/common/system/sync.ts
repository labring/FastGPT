import type { RedisChannelSubscription } from '@fastgpt/dal/redis/adapter';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { subscribeDatasetTrainingQueue } from '@/service/core/dataset/training/utils';

const logger = getLogger(LogCategories.SYSTEM);

let trainingSubscription: RedisChannelSubscription | undefined;

export const cleanupSystemSync = async () => {
  const current = trainingSubscription;
  trainingSubscription = undefined;
  await current?.close();
};

/**
 * 启动知识库训练队列的 Redis Pub/Sub 唤醒订阅。
 *
 * 实例配置由常驻轮询刷新，模板由 Redis 版本化数据缓存（VersionedDataCache）按需读取，
 * 模型目录按自身 revision 刷新；此处仅管理训练队列唤醒订阅并返回关闭入口。
 */
export const startSystemSync = async () => {
  await cleanupSystemSync();

  const current = subscribeDatasetTrainingQueue();
  trainingSubscription = current;
  await current.ready;
  logger.info('Redis pub/sub training sync started');

  return async () => {
    await current.close();
    if (trainingSubscription === current) {
      trainingSubscription = undefined;
    }
  };
};
