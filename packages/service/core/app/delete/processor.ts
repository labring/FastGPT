import type { Processor } from '@fastgpt/dal/redis/bullmq';
import type { AppDeleteJobData } from './index';
import { appDeleteMQService } from '@fastgpt/dal/redis/bullmq';
import { findAppAndAllChildren, deleteAppDataProcessor } from '../controller';
import { MongoApp } from '../schema';
import { getLogger, LogCategories } from '../../../common/logger';

const logger = getLogger(LogCategories.MODULE.APP.FOLDER);

/**
 * Clean one app using only the fields required by the existing deletion processor.
 * Missing apps are treated as an idempotent completion; live apps fail the safety check.
 */
const deleteSingleApp = async ({ teamId, appId }: { teamId: string; appId: string }) => {
  const startTime = Date.now();
  const app = await MongoApp.findOne(
    {
      _id: appId,
      teamId
    },
    '_id teamId type avatar deleteTime'
  ).lean();

  if (!app) {
    logger.warn('App not found for deletion', { teamId, appId });
    return;
  }

  // Recheck the soft-delete marker so stale jobs cannot remove a live app.
  if (!app.deleteTime) {
    logger.warn('App delete safety check mismatch', {
      teamId,
      appId,
      markedCount: 0,
      totalCount: 1
    });
    throw new Error('App delete safety check mismatch');
  }

  await deleteAppDataProcessor({ app, teamId });

  logger.info('App delete completed', {
    teamId,
    appId,
    durationMs: Date.now() - startTime
  });
};

export const appDeleteProcessor: Processor<AppDeleteJobData> = async (job) => {
  const { teamId, appId, jobType = 'root' } = job.data;
  const startTime = Date.now();

  logger.info('App delete started', { teamId, appId });

  try {
    if (jobType === 'app') {
      await deleteSingleApp({ teamId, appId });
      return;
    }

    // 1. Find the app subtree using only fields needed to create child jobs.
    const apps = await findAppAndAllChildren({
      teamId,
      appId,
      fields: '_id teamId parentId deleteTime'
    });

    if (!apps || apps.length === 0) {
      logger.warn('App not found for deletion', { teamId, appId });
      return;
    }

    // 2. The root task only splits work, but the complete subtree must be soft-deleted.
    const unmarkedApps = apps.filter((app) => !app.deleteTime);
    if (unmarkedApps.length > 0) {
      logger.warn('App delete safety check mismatch', {
        markedCount: apps.length - unmarkedApps.length,
        totalCount: apps.length,
        unmarkedCount: unmarkedApps.length
      });
      throw new Error('App delete safety check mismatch');
    }

    // 3. Split the work without cleaning any app resources in this job.
    await appDeleteMQService.addAppJobs(
      apps.map((app) => ({
        teamId,
        appId: String(app._id)
      }))
    );

    logger.info('App delete completed', {
      teamId,
      appId,
      childCount: apps.length - 1,
      durationMs: Date.now() - startTime,
      totalApps: apps.length
    });
  } catch (error: any) {
    logger.error('App delete failed', { teamId, appId, error });
    throw error;
  }
};
