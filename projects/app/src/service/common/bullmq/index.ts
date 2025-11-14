import { addLog } from '@fastgpt/service/common/system/log';
import { initS3MQWorker } from '@fastgpt/service/common/s3';

export const initBullMQWorkers = () => {
  addLog.info('Init BullMQ Workers...');
  initS3MQWorker();
};
