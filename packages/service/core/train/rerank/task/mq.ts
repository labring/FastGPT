import { getQueue, QueueNames } from '../../../../common/bullmq';
import { DEFAULT_JOB_BACKOFF_DELAY } from '../constants';

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
