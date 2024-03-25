import { setCron } from '@fastgpt/service/common/system/cron';
import { startTrainingQueue } from '@/service/core/dataset/training/utils';

export const startCron = () => {
  setTrainingQueueCron();
};

export const setTrainingQueueCron = () => {
  setCron('*/1 * * * *', () => {
    startTrainingQueue();
  });
};
