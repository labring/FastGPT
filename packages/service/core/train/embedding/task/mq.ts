import { getQueue, QueueNames } from '../../../../common/bullmq';
import { trainEnv } from '../../common/env';
import {
  createJobCleaner,
  type JobCleanupOptions,
  type JobCleanupResult
} from '../../../../common/bullmq/utils';

export type EmbeddingTrainTaskJobData = {
  taskId: string;
};

export const embeddingTrainTaskQueue = getQueue<EmbeddingTrainTaskJobData>(
  QueueNames.embeddingTrainTask,
  {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: trainEnv.TRAIN_JOB_BACKOFF_DELAY },
      removeOnComplete: { age: 7 * 24 * 60 * 60 },
      removeOnFail: false // Keep failed jobs for troubleshooting
    }
  }
);

export const removeEmbeddingTrainTaskJob = (
  taskId: string,
  options?: JobCleanupOptions
): Promise<JobCleanupResult> => {
  const cleaner = createJobCleaner(options);
  return cleaner.cleanAllJobsByFilter(
    embeddingTrainTaskQueue,
    (job) => String(job.data?.taskId) === String(taskId),
    QueueNames.embeddingTrainTask
  );
};
