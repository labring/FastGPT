import { setCron } from '@fastgpt/service/common/system/cron';
import { startTrainingQueue } from '@/service/core/dataset/training/utils';
import { clearTmpUploadFiles } from '@fastgpt/service/common/file/utils';
import { checkInvalidDatasetData, checkInvalidVector } from './cronTask';
import { checkTimerLock, deleteTimerLock } from '@fastgpt/service/common/system/timerLock/utils';
import { TimerIdEnum } from '@fastgpt/service/common/system/timerLock/constants';
import { addHours } from 'date-fns';
import { getScheduleTriggerApp } from '@/service/core/app/utils';
import { runSandboxArchiveCron as sandboxCronJob } from '@fastgpt/service/core/ai/sandbox/interface/admin';
import { clearExpiredS3FilesCron } from '@fastgpt/service/common/s3/lifecycle/cleanup';
import { cleanStaleGeneratingChats } from '@fastgpt/service/core/chat/cleanStaleGeneratingChats';
import { checkAndRunModelStatusProbe } from '@fastgpt/service/core/ai/modelStatus/service';

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

/** 基于 Redis stream activity 快速纠正异常中断的 generating 会话，保留 30 分钟兜底 */
const cleanStaleGeneratingChatCron = () => {
  setCron('*/1 * * * *', async () => {
    if (
      await checkTimerLock({
        timerId: TimerIdEnum.cleanStaleGeneratingChat,
        lockMinuted: 1
      })
    ) {
      await cleanStaleGeneratingChats();
    }
  });
};

/** 每分钟先获取 timer lock，进入后由服务层统一校验开关与探测间隔。 */
const modelStatusProbeCron = () => {
  setCron('*/1 * * * *', async () => {
    if (
      await checkTimerLock({
        timerId: TimerIdEnum.modelStatusProbe,
        // 正常完成后会主动释放；10 分钟只作为进程异常退出时的兜底 TTL。
        lockMinuted: 10
      })
    ) {
      try {
        await checkAndRunModelStatusProbe();
      } finally {
        await deleteTimerLock({ timerId: TimerIdEnum.modelStatusProbe });
      }
    }
  });
};

export const startCron = () => {
  setTrainingQueueCron();
  setClearTmpUploadFilesCron();
  clearInvalidDataCron();
  scheduleTriggerAppCron();
  clearExpiredS3FilesCron();
  sandboxCronJob();
  cleanStaleGeneratingChatCron();
  modelStatusProbeCron();
};
