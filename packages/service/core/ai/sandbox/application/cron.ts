/**
 * 沙盒业务层：注册 sandbox 闲置暂停和归档定时任务。
 *
 * 只负责 cron 调度和锁控制，具体 stop/archive 流程交给对应业务服务。
 */
import { SANDBOX_SUSPEND_MINUTES } from '@fastgpt/global/core/ai/sandbox/constants';
import { getLogger, LogCategories } from '../../../../common/logger';
import { setCron } from '../../../../common/system/cron';
import { subMinutes } from 'date-fns';
import { findInactiveRunningSandboxResources } from '../infrastructure/instance/repository';
import { retryStaleStoppingSandboxes, stopSandboxResources } from './resource';
import { checkTimerLock } from '../../../../common/system/timerLock/utils';
import { TimerIdEnum } from '../../../../common/system/timerLock/constants';
import { archiveInactiveSandboxes, retryStaleArchivingSandboxes } from './archive';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

/**
 * 注册 sandbox 闲置暂停任务。
 *
 * 定时任务只负责筛选超过闲置时间的运行中实例，实际 stop 和状态更新交给 resource service，
 * 避免 cron 直接理解 provider 和 Mongo 更新细节。
 */
export const cronJob = async () => {
  setCron('*/10 * * * *', async () => {
    const locked = await checkTimerLock({
      timerId: TimerIdEnum.stopInactiveSandboxes,
      lockMinuted: 9
    });
    if (!locked) return;

    const instances = await findInactiveRunningSandboxResources(
      subMinutes(new Date(), SANDBOX_SUSPEND_MINUTES)
    );
    if (!instances.length) return;

    logger.info(`Found running sandboxes inactive > ${SANDBOX_SUSPEND_MINUTES} min`, {
      count: instances.length
    });
    await stopSandboxResources(instances);
  });

  setCron('0 */12 * * *', async () => {
    const locked = await checkTimerLock({
      timerId: TimerIdEnum.archiveInactiveSandboxes,
      lockMinuted: 11 * 60
    });
    if (!locked) return;

    await archiveInactiveSandboxes().catch((error) => {
      logger.error('Sandbox archive cron failed', { error });
    });
  });

  setCron('*/10 * * * *', async () => {
    const locked = await checkTimerLock({
      timerId: TimerIdEnum.recoverStaleSandboxOperations,
      lockMinuted: 9
    });
    if (!locked) return;

    await Promise.all([retryStaleArchivingSandboxes(), retryStaleStoppingSandboxes()]).catch(
      (error) => {
        logger.error('Sandbox stale lifecycle recovery cron failed', { error });
      }
    );
  });
};
