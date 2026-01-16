import { getLogger, mod } from '@fastgpt/service/common/logger';
import { initS3MQWorker } from '@fastgpt/service/common/s3';
import { initDatasetDeleteWorker } from '@fastgpt/service/core/dataset/delete';
import { initAppDeleteWorker } from '@fastgpt/service/core/app/delete';

const logger = getLogger(mod.app);

export const initBullMQWorkers = () => {
  logger.info('Init BullMQ Workers...');
  return Promise.all([initS3MQWorker(), initDatasetDeleteWorker(), initAppDeleteWorker()]);
};
