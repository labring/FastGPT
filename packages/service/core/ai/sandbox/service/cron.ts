import { SANDBOX_SUSPEND_MINUTES } from '@fastgpt/global/core/ai/sandbox/constants';
import { getLogger, LogCategories } from '../../../../common/logger';
import { setCron } from '../../../../common/system/cron';
import { subMinutes } from 'date-fns';
import { findInactiveRunningSandboxResources } from '../instance/repository';
import { stopSandboxResources } from './resource';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

/**
 * 注册 sandbox 闲置暂停任务。
 *
 * 定时任务只负责筛选超过闲置时间的运行中实例，实际 stop 和状态更新交给 resource service，
 * 避免 cron 直接理解 provider 和 Mongo 更新细节。
 */
export const cronJob = async () => {
  setCron('*/5 * * * *', async () => {
    const instances = await findInactiveRunningSandboxResources(
      subMinutes(new Date(), SANDBOX_SUSPEND_MINUTES)
    );
    if (!instances.length) return;

    logger.info('Found running sandboxes inactive > 5 min', { count: instances.length });

    await stopSandboxResources(instances);
  });
};
