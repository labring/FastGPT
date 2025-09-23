import { initSystemConfig } from '.';
import { createDatasetTrainingMongoWatch } from '@/service/core/dataset/training/utils';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';
import { debounce } from 'lodash';
import { MongoAppTemplate } from '@fastgpt/service/core/app/templates/templateSchema';
import { getAppTemplatesAndLoadThem } from '@fastgpt/service/core/app/templates/register';
import { watchSystemModelUpdate } from '@fastgpt/service/core/ai/config/utils';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { refetchSystemPlugins } from '@fastgpt/service/core/app/plugin/controller';

export const startMongoWatch = async () => {
  reloadConfigWatch();
  createDatasetTrainingMongoWatch();
  refetchAppTemplates();
  watchSystemModelUpdate();
  refetchSystemPlugins();
};

const reloadConfigWatch = () => {
  const changeStream = MongoSystemConfigs.watch();

  changeStream.on('change', async (change) => {
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

  changeStream.on(
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
