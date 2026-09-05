import type { Processor } from '@fastgpt/dal/redis/bullmq';
import type { AppDeleteJobData } from './index';
import { deleteAppDataProcessor } from '../controller';
import { MongoApp } from '../schema';
import { getLogger, LogCategories } from '../../../common/logger';
import { addAppDeleteJob } from './index';

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
    if (jobType === 'task') {
      logger.info('App delete task completed', {
        teamId,
        appId,
        taskId: job.data.taskId,
        durationMs: Date.now() - startTime
      });
      return;
    }

    if (jobType === 'step' || jobType === 'app') {
      await deleteSingleApp({ teamId, appId });
      return;
    }

    // Legacy root jobs become a bridge to the task Flow. New requests enqueue the Flow directly.
    await addAppDeleteJob({ teamId, appId });

    logger.info('App delete completed', {
      teamId,
      appId,
      durationMs: Date.now() - startTime,
      legacy: true
    });
  } catch (error: any) {
    logger.error('App delete failed', { teamId, appId, error });
    throw error;
  }
};
