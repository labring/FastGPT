import { setCron } from '@fastgpt/service/common/system/cron';
import { startTrainingQueue } from '@/service/core/dataset/training/utils';
import { clearTmpUploadFiles } from '@fastgpt/service/common/file/utils';
import { checkInvalidDatasetData, checkInvalidVector } from './cronTask';
import { checkTimerLock, deleteTimerLock } from '@fastgpt/service/common/system/timerLock/utils';
import { TimerIdEnum } from '@fastgpt/service/common/system/timerLock/constants';
import { addHours } from 'date-fns';
import { getScheduleTriggerApp } from '@/service/core/app/utils';
import { cronJob as sandboxCronJob } from '@fastgpt/service/core/ai/sandbox/application/cron';
import { clearExpiredS3FilesCron } from '@fastgpt/service/common/s3/lifecycle/cleanup';
import { checkAndRunModelStatusProbe } from '@fastgpt/service/core/ai/modelStatus/service';
import { getLogger } from '@fastgpt/service/common/logger';

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

/** 每分钟扫描到期计划；启动扫描走同一入口，由应用级原子领取避免多实例重复执行。 */
const scheduleTriggerAppCron = () => {
  const scan = () =>
    getScheduleTriggerApp().catch((error) => {
      getLogger().error('Schedule trigger scan failed', { error });
    });
  setCron('*/1 * * * *', scan);
  void scan();
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
  modelStatusProbeCron();
};
