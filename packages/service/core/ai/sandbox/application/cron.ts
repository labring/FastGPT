/**
 * 沙盒业务层：注册 sandbox 闲置暂停、归档、stale operation 恢复与双向孤儿资源对账定时任务。
 *
 * 只负责 cron 调度和锁控制，具体生命周期与清理流程交给对应业务服务。
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
import { archiveInactiveSandboxes } from './archive';
import { getAgentSandboxCommonConfig, isAgentSandboxOpenSandboxConfigured } from '../config';
import { retryStaleArchivingSandboxes, retryStaleSandboxActivations } from './lifecycle/service';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

/**
 * 注册 sandbox 闲置暂停、冷归档、异常状态回收和孤儿资源对账任务。
 */
export const cronJob = async () => {
  setCron('*/10 * * * *', async () => {
    if (!isAgentSandboxOpenSandboxConfigured()) return;
    const locked = await checkTimerLock({
      timerId: TimerIdEnum.stopInactiveSandboxes,
      lockMinuted: 9
    });
    if (!locked) return;

    const { suspendMinutes } = getAgentSandboxCommonConfig();
    const instances = await findInactiveRunningSandboxResources(
      subMinutes(new Date(), suspendMinutes)
    );
    if (!instances.length) return;

    logger.info(`Found running sandboxes inactive > ${suspendMinutes} min`, {
      count: instances.length
    });
    await stopSandboxResources(instances);
  });

  setCron('0 */12 * * *', async () => {
    if (!isAgentSandboxOpenSandboxConfigured()) return;
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
    if (!isAgentSandboxOpenSandboxConfigured()) return;
    const locked = await checkTimerLock({
      timerId: TimerIdEnum.recoverStaleSandboxOperations,
      lockMinuted: 9
    });
    if (!locked) return;

    await Promise.all([
      retryStaleArchivingSandboxes(),
      retryStaleStoppingSandboxes(),
      retryStaleDeletingSandboxes(),
      retryStaleSandboxActivations()
    ]).catch((error) => {
      logger.error('Sandbox stale lifecycle recovery cron failed', { error });
    });
  });

  setCron('*/30 * * * *', async () => {
    if (!isAgentSandboxOpenSandboxConfigured()) return;
    const locked = await checkTimerLock({
      timerId: TimerIdEnum.reconcileOrphanSandboxResources,
      lockMinuted: 25
    });
    if (!locked) return;

    await reconcileOrphanSandboxResources().catch((error) => {
      logger.error('Sandbox orphan reconciliation cron failed', { error });
    });
  });
};
