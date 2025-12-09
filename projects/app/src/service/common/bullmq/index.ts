import { addLog } from '@fastgpt/service/common/system/log';
import { initS3MQWorker } from '@fastgpt/service/common/s3';
import { initDatasetDeleteWorker } from '@fastgpt/service/core/dataset/delete';

export const initBullMQWorkers = () => {
  addLog.info('Init BullMQ Workers...');
  initS3MQWorker();
  initDatasetDeleteWorker();
};
