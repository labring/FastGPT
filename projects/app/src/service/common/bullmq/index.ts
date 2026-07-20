import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { initS3MQWorker } from '@fastgpt/service/common/s3';
import { initDatasetDeleteWorker } from '@fastgpt/service/core/dataset/delete';
import { initAppDeleteWorker } from '@fastgpt/service/core/app/delete';
import { initTeamDeleteWorker } from '@fastgpt/service/support/user/team/delete';
import { initCollectionUpdateWorker } from '@fastgpt/service/core/dataset/collection/mq';
import { initWechatPollWorker } from '@fastgpt/service/support/outLink/wechat/mq';
import { initAgentSkillCreateWorker } from '@fastgpt/service/core/ai/skill/manage/creation';
import { initAgentSkillDeleteWorker } from '@fastgpt/service/core/ai/skill/delete';
import { initSandboxDurableSagaRuntime } from '@fastgpt/service/core/ai/sandbox/application/lifecycle';

const logger = getLogger(LogCategories.INFRA.QUEUE);

export const initBullMQWorkers = async () => {
  logger.info('BullMQ workers initialization started');
  const sandboxWorker = await initSandboxDurableSagaRuntime();
  return Promise.all([
    initS3MQWorker(),
    initDatasetDeleteWorker(),
    initAppDeleteWorker(),
    initTeamDeleteWorker(),
    initCollectionUpdateWorker(),
    initAgentSkillCreateWorker(),
    initAgentSkillDeleteWorker(),
    sandboxWorker,
    initWechatPollWorker()
  ]);
};
