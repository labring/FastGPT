import { initSystemConfig } from '.';
import { createDatasetTrainingMongoWatch } from '@/service/core/dataset/training/utils';
import { getSystemPluginTemplates } from '@fastgpt/plugins/register';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';
import { MongoSystemPluginSchema } from '@fastgpt/service/core/app/plugin/systemPluginSchema';

export const startMongoWatch = async () => {
  reloadConfigWatch();
  refetchSystemPlugin();
  createDatasetTrainingMongoWatch();
};

const reloadConfigWatch = () => {
  const changeStream = MongoSystemConfigs.watch();

  changeStream.on('change', async (change) => {
    try {
      if (change.operationType === 'insert') {
        await initSystemConfig();
        console.log('refresh system config');
      }
    } catch (error) {}
  });
};

const refetchSystemPlugin = () => {
  const changeStream = MongoSystemPluginSchema.watch();

  changeStream.on('change', async (change) => {
    try {
      getSystemPluginTemplates(true);
    } catch (error) {}
  });
};
