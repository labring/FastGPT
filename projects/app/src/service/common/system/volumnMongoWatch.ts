import { createDatasetTrainingMongoWatch } from '@/service/core/dataset/training/utils';
import { debounce } from 'lodash-es';
import { MongoAppTemplate } from '@fastgpt/service/core/app/templates/templateSchema';
import { getAppTemplatesAndLoadThem } from '@fastgpt/service/core/app/templates/register';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import {
  createResilientChangeStream,
  type ChangeStreamEvent,
  type ResilientChangeStream
} from '@fastgpt/service/common/mongo/watch';

let changeStreams: ResilientChangeStream[] = [];
const logger = getLogger(LogCategories.INFRA.MONGO);

/** 配置由常驻轮询刷新；这里仅保留训练任务和模板的 Mongo 监听。 */
export const startMongoWatch = async () => {
  await cleanupMongoWatch();
  changeStreams.push(createDatasetTrainingMongoWatch());
  changeStreams.push(refetchAppTemplates());
  return cleanupMongoWatch;
};

const refetchAppTemplates = () => {
  /**
   * 变更与断线补偿共用同一条延迟重拉路径：模板写入通常成批出现，
   * 防抖后再等 5s 读库，避免拉到写一半的中间状态。
   */
  const reload = () => {
    setTimeout(() => {
      void Promise.resolve(getAppTemplatesAndLoadThem(true)).catch((error) =>
        logger.error('App templates reload failed', { error })
      );
    }, 5000);
  };

  return createResilientChangeStream<ChangeStreamEvent>({
    name: 'app-templates',
    createStream: () => MongoAppTemplate.watch(),
    onChange: debounce(reload, 500),
    onResume: reload
  });
};

const cleanupMongoWatch = async () => {
  logger.debug('Mongo change stream watch cleanup');
  const streams = changeStreams;
  changeStreams = [];
  await Promise.all(streams.map((changeStream) => changeStream?.close()));
};
