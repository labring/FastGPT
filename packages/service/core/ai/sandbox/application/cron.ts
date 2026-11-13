/**
 * 沙盒业务层：注册 sandbox 闲置停止、卡死操作自愈与孤儿资源反向对账 GC 定时任务。
 */
import { getLogger, LogCategories } from '../../../../common/logger';
import { setCron } from '../../../../common/system/cron';
import { subMinutes } from 'date-fns';
import { findInactiveRunningSandboxResources } from '../infrastructure/instance/repository';
import {
  reconcileOrphanSandboxResources,
  retryStaleDeletingSandboxes,
  retryStaleStoppingSandboxes,
  stopSandboxResources
} from './resource';
import { checkTimerLock } from '../../../../common/system/timerLock/utils';
import { TimerIdEnum } from '../../../../common/system/timerLock/constants';
import { getAgentSandboxSuspendMinutes } from '../config';
import { retryStaleSandboxActivations } from './lifecycle/service';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

/**
 * 注册 sandbox 闲置停止、异常过渡态自愈与反向孤儿资源对账 GC 任务。
 */
export const cronJob = async () => {
  setCron('*/10 * * * *', async () => {
    const locked = await checkTimerLock({
      timerId: TimerIdEnum.stopInactiveSandboxes,
      lockMinuted: 9
    });
    if (!locked) return;

    const suspendMinutes = getAgentSandboxSuspendMinutes();
    const instances = await findInactiveRunningSandboxResources(
      subMinutes(new Date(), suspendMinutes)
    );
    if (!instances.length) return;

    logger.info(`Found running sandboxes inactive > ${suspendMinutes} min`, {
      count: instances.length
    });
    await stopSandboxResources(instances);
  });

  setCron('*/10 * * * *', async () => {
    const locked = await checkTimerLock({
      timerId: TimerIdEnum.recoverStaleSandboxOperations,
      lockMinuted: 9
    });
    if (!locked) return;

    await Promise.all([
      retryStaleStoppingSandboxes(),
      retryStaleDeletingSandboxes(),
      retryStaleSandboxActivations()
    ]).catch((error) => {
      logger.error('Sandbox stale lifecycle recovery cron failed', { error });
    });
  });

  setCron('*/30 * * * *', async () => {
    const locked = await checkTimerLock({
      timerId: TimerIdEnum.reconcileOrphanSandboxResources,
      lockMinuted: 29
    });
    if (!locked) return;

    await reconcileOrphanSandboxResources();
  });
};
