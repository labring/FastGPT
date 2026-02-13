import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { initS3MQWorker } from '@fastgpt/service/common/s3';
import { initDatasetDeleteWorker } from '@fastgpt/service/core/dataset/delete';
import { initAppDeleteWorker } from '@fastgpt/service/core/app/delete';
import { initTeamDeleteWorker } from '@fastgpt/service/support/user/team/delete';

const logger = getLogger(LogCategories.INFRA.QUEUE);

export const initBullMQWorkers = () => {
  logger.info('BullMQ workers initialization started');
  return Promise.all([
    initS3MQWorker(),
    initDatasetDeleteWorker(),
    initAppDeleteWorker(),
    initTeamDeleteWorker()
  ]);
};
