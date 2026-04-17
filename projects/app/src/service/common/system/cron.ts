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
import { collectionCleanup } from '@fastgpt/service/core/dataset/collection/delete/processor';
import { cronJob as sandboxCronJob } from '@fastgpt/service/core/ai/sandbox/controller';

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

// 每天凌晨2点检查孤儿软删除 collection（deleteTime 超过24小时但未被物理删除）
const collectionCleanupCron = () => {
  setCron('0 2 * * *', async () => {
    if (
      await checkTimerLock({
        timerId: TimerIdEnum.collectionCleanup,
        lockMinuted: 23 * 60 // 23小时内不重复执行
      })
    ) {
      await collectionCleanup();
    }
  });
};

export const startCron = () => {
  setTrainingQueueCron();
  setClearTmpUploadFilesCron();
  clearInvalidDataCron();
  scheduleTriggerAppCron();
  cronRefreshModels();
  clearExpiredS3FilesCron();
  collectionCleanupCron();
  sandboxCronJob();
};
