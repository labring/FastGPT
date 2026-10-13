import { initSystemConfig } from '.';
import { createDatasetTrainingMongoWatch } from '@/service/core/dataset/training/utils';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';
import { debounce } from 'lodash-es';
import { MongoAppTemplate } from '@fastgpt/service/core/app/templates/templateSchema';
import { getAppTemplatesAndLoadThem } from '@fastgpt/service/core/app/templates/register';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import {
  createResilientChangeStream,
  type ChangeStreamEvent,
  type ResilientChangeStream
} from '@fastgpt/service/common/mongo/watch';

type SystemConfigChange = {
  operationType?: string;
  fullDocument?: { type?: `${SystemConfigsTypeEnum}` };
};

let changeStreams: ResilientChangeStream[] = [];
const logger = getLogger(LogCategories.INFRA.MONGO);

/** 只监听系统配置、训练和模板；模型目录通过 revision 按需刷新，不订阅集合变化。 */
export const startMongoWatch = async () => {
  await cleanupMongoWatch();
  logger.info('Mongo change stream watch started');
  changeStreams.push(reloadConfigWatch());
  changeStreams.push(createDatasetTrainingMongoWatch());
  changeStreams.push(refetchAppTemplates());
};

/**
 * 重载系统配置。既用于配置变更事件，也用于断线重连后的补偿：
 * 停机期间写入的配置不会重放，只能重新读一次最新值。
 */
const refreshSystemConfig = async () => {
  await initSystemConfig();
  logger.info('System config refreshed via Mongo change stream');
};

const reloadConfigWatch = () =>
  createResilientChangeStream<SystemConfigChange>({
    name: 'app-system-configs',
    createStream: () => MongoSystemConfigs.watch([], { fullDocument: 'updateLookup' }),
    onChange: (change) => {
      const { operationType, fullDocument } = change;
      const shouldRefresh =
        operationType === 'update' ||
        (operationType === 'insert' &&
          (fullDocument?.type === SystemConfigsTypeEnum.fastgptPro ||
            fullDocument?.type === SystemConfigsTypeEnum.license));

      if (shouldRefresh) return refreshSystemConfig();
    },
    onResume: refreshSystemConfig
  });

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
