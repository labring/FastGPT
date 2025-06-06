import { setCron } from '@fastgpt/service/common/system/cron';
import { startTrainingQueue } from '@/service/core/dataset/training/utils';
import { clearTmpUploadFiles } from '@fastgpt/service/common/file/utils';
import {
  checkInvalidDatasetFiles,
  checkInvalidDatasetData,
  checkInvalidVector,
  removeExpiredChatFiles
} from './cronTask';
import { checkTimerLock } from '@fastgpt/service/common/system/timerLock/utils';
import { TimerIdEnum } from '@fastgpt/service/common/system/timerLock/constants';
import { addHours } from 'date-fns';
import { getScheduleTriggerApp } from '@/service/core/app/utils';
import { clearExpiredRawTextBufferCron } from '@fastgpt/service/common/buffer/rawText/controller';
import { clearExpiredDatasetImageCron } from '@fastgpt/service/core/dataset/image/controller';

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
  // Clear files
  setCron('0 */1 * * *', async () => {
    if (
      await checkTimerLock({
        timerId: TimerIdEnum.checkExpiredFiles,
        lockMinuted: 59
      })
    ) {
      await checkInvalidDatasetFiles(addHours(new Date(), -6), addHours(new Date(), -2));
      removeExpiredChatFiles();
    }
  });

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
};

export const startCron = () => {
  setTrainingQueueCron();
  setClearTmpUploadFilesCron();
  clearInvalidDataCron();
  scheduleTriggerAppCron();
  clearExpiredRawTextBufferCron();
  clearExpiredDatasetImageCron();
};
