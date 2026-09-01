import { appDeleteProcessor } from './processor';
import { appDeleteMQService, type AppDeleteJobData } from '@fastgpt/dal/redis/bullmq';
import { MongoApp } from '../schema';
import { batchRunSettled } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../../common/logger';
import { setCron } from '../../../common/system/cron';

export type { AppDeleteJobData } from '@fastgpt/dal/redis/bullmq';

const APP_DELETE_RESUME_BATCH_SIZE = 200;
const APP_DELETE_RESUME_CONCURRENCY = 5;
const APP_DELETE_RESUME_CRON = '*/5 * * * *';
const logger = getLogger(LogCategories.MODULE.APP.FOLDER);

let recoveryCronRegistered = false;
let recoveryPromise: Promise<void> | undefined;

/**
 * Initialize the app deletion worker and asynchronously resume soft-deleted apps
 * whose cleanup was not completed. Recovery does not block worker creation, and
 * one failed enqueue does not prevent other apps in the same batch from proceeding.
 */
export const initAppDeleteWorker = () => {
  const worker = appDeleteMQService.getWorker(appDeleteProcessor);

  registerAppDeleteRecoveryCron();

  resumeMarkedAppDeleteJobs().catch((error) => {
    logger.error('Failed to resume marked app delete jobs', { error });
  });

  return worker;
};

/**
 * Keep recovery alive after transient Redis or Mongo failures during startup.
 * Stable app job IDs make repeated scans idempotent across workers and pods.
 */
const registerAppDeleteRecoveryCron = () => {
  if (recoveryCronRegistered) return;

  recoveryCronRegistered = true;
  setCron(APP_DELETE_RESUME_CRON, () => {
    resumeMarkedAppDeleteJobs().catch((error) => {
      logger.error('Failed to resume marked app delete jobs', { error });
    });
  });
};

/**
 * Scan soft-deleted apps and resume their single-app deletion jobs.
 * Cursor pagination and bounded concurrency prevent startup from saturating Mongo or Redis.
 */
async function resumeMarkedAppDeleteJobsInternal(): Promise<void> {
  const cursor = MongoApp.find(
    {
      deleteTime: {
        $exists: true,
        $ne: null
      }
    },
    {
      _id: 1,
      teamId: 1
    }
  )
    .lean()
    .cursor({ batchSize: APP_DELETE_RESUME_BATCH_SIZE });

  let totalMarked = 0;
  let resumedCount = 0;
  let failedCount = 0;
  let batch: { teamId: string; appId: string }[] = [];

  /** Flush one bounded batch so startup recovery does not overload Redis or Mongo. */
  const flushBatch = async () => {
    if (batch.length === 0) return;

    const currentBatch = batch;
    batch = [];
    const results = await batchRunSettled(
      currentBatch,
      (item) => appDeleteMQService.addAppJob(item),
      APP_DELETE_RESUME_CONCURRENCY
    );
    resumedCount += results.filter((result) => result.success).length;
    failedCount += results.filter((result) => !result.success).length;
  };

  for await (const app of cursor) {
    totalMarked += 1;
    batch.push({
      teamId: String(app.teamId),
      appId: String(app._id)
    });

    if (batch.length >= APP_DELETE_RESUME_BATCH_SIZE) {
      await flushBatch();
    }
  }

  await flushBatch();

  logger.info('Marked app delete jobs resumed', {
    totalMarked,
    resumedCount,
    failedCount
  });
}

/**
 * Resume marked app cleanup with process-local overlap protection.
 * Multiple callers share one scan while distributed callers converge on stable job IDs.
 */
export function resumeMarkedAppDeleteJobs(): Promise<void> {
  if (recoveryPromise) return recoveryPromise;

  recoveryPromise = resumeMarkedAppDeleteJobsInternal().finally(() => {
    recoveryPromise = undefined;
  });
  return recoveryPromise;
}

/** Add a root app deletion job. */
export const addAppDeleteJob = (data: AppDeleteJobData) => appDeleteMQService.addJob(data);

/** Add a single-app deletion job for startup recovery and other recovery flows. */
export const addAppDeleteAppJob = (data: Omit<AppDeleteJobData, 'jobType'>) =>
  appDeleteMQService.addAppJob(data);
