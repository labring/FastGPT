import type { Processor } from 'bullmq';
import type { AppDeleteJobData } from './index';
import { findAppAndAllChildren, deleteAppDataProcessor } from '../controller';
import { batchRun } from '@fastgpt/global/common/system/utils';
import type { AppSchemaType } from '@fastgpt/global/core/app/type';
import { MongoApp } from '../schema';
import { getLogger, LogCategories } from '../../../common/logger';

const logger = getLogger(LogCategories.MODULE.APP);

const deleteApps = async ({ teamId, apps }: { teamId: string; apps: AppSchemaType[] }) => {
  const results = await batchRun(
    apps,
    async (app) => {
      await deleteAppDataProcessor({ app, teamId });
    },
    3
  );

  return results.flat();
};

export const appDeleteProcessor: Processor<AppDeleteJobData> = async (job) => {
  const { teamId, appId } = job.data;
  const startTime = Date.now();

  logger.info('App delete started', { teamId, appId });

  try {
    // 1. 查找应用及其所有子应用
    const apps = await findAppAndAllChildren({
      teamId,
      appId
    });

    if (!apps || apps.length === 0) {
      logger.warn('App not found for deletion', { teamId, appId });
      return;
    }

    // 2. 安全检查：确保所有要删除的应用都已标记为 deleteTime
    const markedForDelete = await MongoApp.find(
      {
        _id: { $in: apps.map((app) => app._id) },
        teamId,
        deleteTime: { $ne: null }
      },
      { _id: 1 }
    ).lean();

    if (markedForDelete.length !== apps.length) {
      logger.warn('App delete safety check mismatch', {
        markedCount: markedForDelete.length,
        totalCount: apps.length,
        markedAppIds: markedForDelete.map((app) => app._id),
        totalAppIds: apps.map((app) => app._id)
      });
    }

    const childrenLen = apps.length - 1;
    const appIds = apps.map((app) => app._id);

    // 3. 执行真正的删除操作（只删除已经标记为 deleteTime 的数据）
    await deleteApps({
      teamId,
      apps
    });

    logger.info('App delete completed', {
      teamId,
      appId,
      childCount: childrenLen,
      durationMs: Date.now() - startTime,
      totalApps: appIds.length,
      appIds
    });
  } catch (error: any) {
    logger.error('App delete failed', { teamId, appId, error });
    throw error;
  }
};
