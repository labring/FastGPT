import { getQueue, QueueNames } from '../../../../common/bullmq';
import { DEFAULT_JOB_BACKOFF_DELAY } from '../constants';
import {
  createJobCleaner,
  type JobCleanupOptions,
  type JobCleanupResult
} from '../../../../common/bullmq/utils';

export type RerankTrainTaskJobData = {
  taskId: string;
};

export const rerankTrainTaskQueue = getQueue<RerankTrainTaskJobData>(QueueNames.rerankTrainTask, {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: DEFAULT_JOB_BACKOFF_DELAY },
    removeOnComplete: { age: 7 * 24 * 60 * 60 },
    removeOnFail: false // Keep failed jobs for troubleshooting
  }
});

export const removeRerankTrainTaskJob = (
  taskId: string,
  options?: JobCleanupOptions
): Promise<JobCleanupResult> => {
  const cleaner = createJobCleaner(options);
  return cleaner.cleanAllJobsByFilter(
    rerankTrainTaskQueue,
    (job) => String(job.data?.taskId) === String(taskId),
    QueueNames.rerankTrainTask
  );
};
