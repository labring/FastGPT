import { addOrRequeueFailedJob } from '../job-recovery';
import { bullMQ, type BullMQBinding } from '../binding';
import { QueueNames } from '../names';
import type { Processor, Queue, Worker } from '../types';

export type UserImportJobData = {
  taskId: string;
};

const userImportQueueOptions = {
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential' as const, delay: 5000 },
    removeOnComplete: true,
    removeOnFail: { age: 30 * 24 * 60 * 60 }
  }
};

/** BullMQ contract for asynchronous administrator user imports. */
export class UserImportMQService {
  constructor(private readonly binding: BullMQBinding = bullMQ) {}

  getQueue(): Queue<UserImportJobData> {
    return this.binding.getQueue<UserImportJobData>(QueueNames.userImport, userImportQueueOptions);
  }

  getWorker(processor: Processor<UserImportJobData>): Worker<UserImportJobData> {
    return this.binding.getWorker<UserImportJobData>(QueueNames.userImport, processor, {
      concurrency: 1,
      removeOnFail: { age: 90 * 24 * 60 * 60, count: 10000 }
    });
  }

  addJob(data: UserImportJobData) {
    return addOrRequeueFailedJob({
      queue: this.getQueue(),
      name: 'import_users',
      data,
      opts: { jobId: data.taskId }
    });
  }
}

export const userImportMQService = new UserImportMQService();
