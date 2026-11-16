import { initSystemConfig } from '.';
import { createDatasetTrainingMongoWatch } from '@/service/core/dataset/training/utils';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import {
  createResilientChangeStream,
  type ResilientChangeStream
} from '@fastgpt/service/common/mongo/watch';

type SystemConfigChange = {
  operationType?: string;
  fullDocument?: { type?: `${SystemConfigsTypeEnum}` };
};

let changeStreams: ResilientChangeStream[] = [];
const logger = getLogger(LogCategories.INFRA.MONGO);

/** 只监听系统配置和训练；模型目录与应用模板按版本读取，不订阅集合变化。 */
export const startMongoWatch = async () => {
  await cleanupMongoWatch();
  logger.info('Mongo change stream watch started');
  changeStreams.push(reloadConfigWatch());
  changeStreams.push(createDatasetTrainingMongoWatch());
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

const cleanupMongoWatch = async () => {
  logger.debug('Mongo change stream watch cleanup');
  const streams = changeStreams;
  changeStreams = [];
  await Promise.all(streams.map((changeStream) => changeStream?.close()));
};
