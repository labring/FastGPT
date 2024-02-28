import { initSystemConfig } from '@/pages/api/common/system/getInitData';
import { startQueue } from '@/service/utils/tools';
import { setCron } from '@fastgpt/service/common/system/cron';

export const startCron = () => {
  setUpdateSystemConfigCron();
  setTrainingQueueCron();
};

export const setUpdateSystemConfigCron = () => {
  setCron('*/5 * * * *', () => {
    initSystemConfig();
    console.log('refresh system config');
  });
};

export const setTrainingQueueCron = () => {
  setCron('*/1 * * * *', () => {
    startQueue();
  });
};
