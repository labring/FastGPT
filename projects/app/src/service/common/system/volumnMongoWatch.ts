import { initSystemConfig } from '.';
import { createDatasetTrainingMongoWatch } from '@/service/core/dataset/training/utils';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';
import { debounce } from 'lodash-es';
import { MongoAppTemplate } from '@fastgpt/service/core/app/templates/templateSchema';
import { getAppTemplatesAndLoadThem } from '@fastgpt/service/core/app/templates/register';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

let changeStreams: any[] = [];
const logger = getLogger(LogCategories.INFRA.MONGO);

/** 只监听系统配置、训练和模板；模型目录通过 revision 按需刷新，不订阅集合变化。 */
export const startMongoWatch = async () => {
  cleanupMongoWatch();
  logger.info('Mongo change stream watch started');
  changeStreams.push(reloadConfigWatch());
  changeStreams.push(createDatasetTrainingMongoWatch());
  changeStreams.push(refetchAppTemplates());
};

const reloadConfigWatch = () => {
  const changeStream = MongoSystemConfigs.watch([], { fullDocument: 'updateLookup' });

  return changeStream.on('change', async (change) => {
    try {
      if (
        change.operationType === 'update' ||
        (change.operationType === 'insert' &&
          [SystemConfigsTypeEnum.fastgptPro, SystemConfigsTypeEnum.license].includes(
            change.fullDocument.type
          ))
      ) {
        await initSystemConfig();
        logger.info('System config refreshed via Mongo change stream');
      }
    } catch {}
  });
};

const refetchAppTemplates = () => {
  const changeStream = MongoAppTemplate.watch();

  return changeStream.on(
    'change',
    debounce(async () => {
      setTimeout(() => {
        try {
          getAppTemplatesAndLoadThem(true);
        } catch {}
      }, 5000);
    }, 500)
  );
};

const cleanupMongoWatch = () => {
  logger.debug('Mongo change stream watch cleanup');
  changeStreams.forEach((changeStream) => {
    changeStream?.close();
  });
  changeStreams = [];
};
