import { setCron } from '@fastgpt/service/common/system/cron';
import { startTrainingQueue } from '@/service/core/dataset/training/utils';
import { clearTmpUploadFiles } from '@fastgpt/service/common/file/utils';
import { checkInvalidDatasetData, checkInvalidVector } from './cronTask';
import { checkTimerLock } from '@fastgpt/service/common/system/timerLock/utils';
import { TimerIdEnum } from '@fastgpt/service/common/system/timerLock/constants';
import { addHours } from 'date-fns';
import { getScheduleTriggerApp } from '@/service/core/app/utils';
import { cronRefreshModels } from '@fastgpt/service/core/ai/config/utils';
import { clearExpiredS3FilesCron } from '@fastgpt/service/common/s3/controller';
import { cronJob as sandboxCronJob } from '@fastgpt/service/core/ai/sandbox/controller';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import {
  cleanupExpiredAppChatLogs,
  cleanupExpiredAuditLogs,
  cleanupExpiredChatHistories,
  hasAuditLogRetentionPolicy,
  hasChatRetentionPolicy
} from './dataRetention';

const logger = getLogger(LogCategories.INFRA.MONGO);

// Try to run train every minute
const setTrainingQueueCron = () => {
  setCron('*/1 * * * *', () => {
    startTrainingQueue();
  });
};

// Clear tmp upload files every ten minutes
const setClearTmpUploadFilesCron = () => {
  // Clear tmp upload files every ten minutes
  setCron('*/10 * * * *', () => {
    clearTmpUploadFiles();
  });
};

const clearInvalidDataCron = () => {
  setCron('10 */1 * * *', async () => {
    if (
      await checkTimerLock({
        timerId: TimerIdEnum.checkInvalidDatasetData,
        lockMinuted: 59
      })
    ) {
      checkInvalidDatasetData(addHours(new Date(), -6), addHours(new Date(), -2));
    }
  });

  setCron('30 */1 * * *', async () => {
    if (
      await checkTimerLock({
        timerId: TimerIdEnum.checkInvalidVector,
        lockMinuted: 59
      })
    ) {
      checkInvalidVector(addHours(new Date(), -6), addHours(new Date(), -2));
    }
  });
};

const dataRetentionCron = () => {
  setCron('20 */1 * * *', async () => {
    if (!hasChatRetentionPolicy()) return;

    if (
      await checkTimerLock({
        timerId: TimerIdEnum.chatHistoryCleanup,
        lockMinuted: 59
      })
    ) {
      await cleanupExpiredChatHistories().catch((error) => {
        logger.error('cleanupExpiredChatHistories error', { error });
      });
      await cleanupExpiredAppChatLogs().catch((error) => {
        logger.error('cleanupExpiredAppChatLogs error', { error });
      });
    }
  });

  setCron('40 */1 * * *', async () => {
    if (!hasAuditLogRetentionPolicy()) return;

    if (
      await checkTimerLock({
        timerId: TimerIdEnum.auditLogCleanup,
        lockMinuted: 59
      })
    ) {
      await cleanupExpiredAuditLogs().catch((error) => {
        logger.error('cleanupExpiredAuditLogs error', { error });
      });
    }
  });
};

// Run app timer trigger every hour
const scheduleTriggerAppCron = () => {
  setCron('0 */1 * * *', async () => {
    if (
      await checkTimerLock({
        timerId: TimerIdEnum.scheduleTriggerApp,
        lockMinuted: 59
      })
    ) {
      getScheduleTriggerApp();
    }
  });
  getScheduleTriggerApp();
};

export const startCron = () => {
  setTrainingQueueCron();
  setClearTmpUploadFilesCron();
  clearInvalidDataCron();
  dataRetentionCron();
  scheduleTriggerAppCron();
  cronRefreshModels();
  clearExpiredS3FilesCron();
  sandboxCronJob();
};
