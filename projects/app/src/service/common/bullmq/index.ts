import { addLog } from '@fastgpt/service/common/system/log';
import { initS3MQWorker } from '@fastgpt/service/common/s3';
import { initDatasetDeleteWorker } from '@fastgpt/service/core/dataset/delete';
import { initCollectionDeleteWorker } from '@fastgpt/service/core/dataset/collection/delete';
import { initAppDeleteWorker } from '@fastgpt/service/core/app/delete';
import { initTeamDeleteWorker } from '@fastgpt/service/support/user/team/delete';

export const initBullMQWorkers = () => {
  addLog.info('Init BullMQ Workers...');
  return Promise.all([
    initS3MQWorker(),
    initDatasetDeleteWorker(),
    initCollectionDeleteWorker(),
    initAppDeleteWorker(),
    initTeamDeleteWorker()
  ]);
};
