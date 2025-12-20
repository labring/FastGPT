import type { Processor } from 'bullmq';
import type { AppDeleteJobData } from './index';
import { findAppAndAllChildren, deleteAppDataProcessor } from '../controller';
import { addLog } from '../../../common/system/log';
import { batchRun } from '@fastgpt/global/common/system/utils';
import type { AppSchema } from '@fastgpt/global/core/app/type';
import { MongoApp } from '../schema';

const deleteApps = async ({ teamId, apps }: { teamId: string; apps: AppSchema[] }) => {
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

  addLog.info(`[App Delete] Start deleting app: ${appId} for team: ${teamId}`);

  try {
    // 1. 查找应用及其所有子应用
    const apps = await findAppAndAllChildren({
      teamId,
      appId
    });

    if (!apps || apps.length === 0) {
      addLog.warn(`[App Delete] App not found: ${appId}`);
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
      addLog.warn(
        `[App Delete] Safety check: ${markedForDelete.length}/${apps.length} apps marked for deletion`,
        {
          markedAppIds: markedForDelete.map((app) => app._id),
          totalAppIds: apps.map((app) => app._id)
        }
      );
    }

    const childrenLen = apps.length - 1;
    const appIds = apps.map((app) => app._id);

    // 3. 执行真正的删除操作（只删除已经标记为 deleteTime 的数据）
    await deleteApps({
      teamId,
      apps
    });

    addLog.info(`[App Delete] Successfully deleted app: ${appId} and ${childrenLen} children`, {
      duration: Date.now() - startTime,
      totalApps: appIds.length,
      appIds
    });
  } catch (error: any) {
    addLog.error(`[App Delete] Failed to delete app: ${appId}`, error);
    throw error;
  }
};
