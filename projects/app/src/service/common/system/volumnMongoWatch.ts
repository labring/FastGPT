import { initSystemConfig } from '.';
import { createDatasetTrainingMongoWatch } from '@/service/core/dataset/training/utils';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';
import { debounce } from 'lodash';
import { MongoAppTemplate } from '@fastgpt/service/core/app/templates/templateSchema';
import { getAppTemplatesAndLoadThem } from '@fastgpt/service/core/app/templates/register';
import { watchSystemModelUpdate } from '@fastgpt/service/core/ai/config/utils';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';

let changeStreams: any[] = [];

export const startMongoWatch = async () => {
  cleanupMongoWatch();
  console.log('Watch mongo db start');
  changeStreams.push(reloadConfigWatch());
  changeStreams.push(createDatasetTrainingMongoWatch());
  changeStreams.push(refetchAppTemplates());
  changeStreams.push(watchSystemModelUpdate());
};

const reloadConfigWatch = () => {
  const changeStream = MongoSystemConfigs.watch();

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
        console.log('refresh system config');
      }
    } catch (error) {}
  });
};

const refetchAppTemplates = () => {
  const changeStream = MongoAppTemplate.watch();

  return changeStream.on(
    'change',
    debounce(async (change) => {
      setTimeout(() => {
        try {
          getAppTemplatesAndLoadThem(true);
        } catch (error) {}
      }, 5000);
    }, 500)
  );
};

const cleanupMongoWatch = () => {
  changeStreams.forEach((changeStream) => {
    changeStream?.close();
  });
  changeStreams = [];
};
