import { createDatasetTrainingMongoWatch } from '@/service/core/dataset/training/utils';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import type { ResilientChangeStream } from '@fastgpt/service/common/mongo/watch';

let changeStreams: ResilientChangeStream[] = [];
const logger = getLogger(LogCategories.INFRA.MONGO);

/** 配置由常驻轮询刷新，模板按 Redis 版本读取；这里只保留训练任务监听并返回关闭入口。 */
export const startMongoWatch = async () => {
  await cleanupMongoWatch();
  changeStreams.push(createDatasetTrainingMongoWatch());
  return cleanupMongoWatch;
};

const cleanupMongoWatch = async () => {
  logger.debug('Mongo change stream watch cleanup');
  const streams = changeStreams;
  changeStreams = [];
  await Promise.all(streams.map((changeStream) => changeStream?.close()));
};
