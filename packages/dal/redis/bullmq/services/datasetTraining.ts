import { bullMQ } from '../binding';
import { QueueNames } from '../names';
import type { Processor, Queue, Worker } from '../types';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';

export type DatasetTrainingJobData = { collectionId: string };

const getQueue = (): Queue<DatasetTrainingJobData> =>
  bullMQ.getQueue<DatasetTrainingJobData>(QueueNames.datasetTraining, {
    defaultJobOptions: { attempts: 1, removeOnComplete: true }
  });

/** 文档尚有非终态 Job 时始终合并投递。续跑由业务层在 Job 完成后决定。 */
const enqueueBatch = (collectionIds: string[]) =>
  getQueue().addBulk(
    collectionIds.map((id) => {
      const collectionId = ObjectIdSchema.parse(id).toLowerCase();
      return {
        name: QueueNames.datasetTraining,
        data: { collectionId },
        opts: { deduplication: { id: collectionId } }
      };
    })
  );

const getWorker = (
  processor: Processor<DatasetTrainingJobData>,
  concurrency: number
): Worker<DatasetTrainingJobData> =>
  bullMQ.getWorker(QueueNames.datasetTraining, processor, { concurrency });

export const datasetTrainingMQService = { getQueue, enqueueBatch, getWorker };
