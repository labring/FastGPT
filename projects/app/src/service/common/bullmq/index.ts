import { addLog } from '@fastgpt/service/common/system/log';
import { initS3MQWorker } from '@fastgpt/service/common/s3';
import { initDatasetDeleteWorker } from '@fastgpt/service/core/dataset/delete';
import { initAppDeleteWorker } from '@fastgpt/service/core/app/delete';

export const initBullMQWorkers = () => {
  addLog.info('Init BullMQ Workers...');
  return Promise.all([initS3MQWorker(), initDatasetDeleteWorker(), initAppDeleteWorker()]);
};
