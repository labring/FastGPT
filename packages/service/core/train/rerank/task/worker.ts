import { getWorker, QueueNames } from '../../../../common/bullmq';
import { addLog } from '../../../../common/system/log';
import { type RerankTrainTaskJobData } from './mq';
import { rerankTrainTaskProcessor } from './processor';
import { MongoRerankTrainTask } from './schema';
import { RerankTrainTaskStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { DEFAULT_WORKER_STALLED_INTERVAL } from '../constants';

export function initRerankTrainTaskWorker() {
  const worker = getWorker<RerankTrainTaskJobData>(
    QueueNames.rerankTrainTask,
    rerankTrainTaskProcessor,
    {
      stalledInterval: DEFAULT_WORKER_STALLED_INTERVAL,
      maxStalledCount: 3,
      concurrency: 1 // Limit to 1 concurrent training task to avoid resource contention
    }
  );

  worker.on('active', (job) => {
    if (job?.data) {
      const { taskId } = job.data;
      addLog.info('[RerankTrainTask] Task started', {
        jobId: job.id,
        taskId
      });
    }
  });

  worker.on('completed', (job) => {
    if (job?.data) {
      const { taskId } = job.data;
      addLog.info('[RerankTrainTask] Task completed', {
        jobId: job.id,
        taskId
      });
    }
  });

  worker.on('stalled', async (jobId: string) => {
    addLog.warn('[RerankTrainTask] Task stalled, will be retried', {
      jobId
    });
  });

  worker.on('failed', async (job, error) => {
    if (job?.data) {
      const { taskId } = job.data;
      addLog.error('[RerankTrainTask] Task failed', {
        jobId: job.id,
        taskId,
        error: error.message
      });

      try {
        await MongoRerankTrainTask.updateOne(
          { _id: taskId },
          {
            status: RerankTrainTaskStatusEnum.failed,
            errorMsg: error.message,
            updateTime: new Date()
          }
        );
        addLog.info('[RerankTrainTask] Task status updated to failed in MongoDB', {
          taskId
        });
      } catch (updateError) {
        addLog.error('[RerankTrainTask] Failed to update task status in MongoDB', {
          taskId,
          updateError: (updateError as Error).message
        });
      }
    }
  });

  addLog.info('[RerankTrainTask] Worker created successfully');
  return worker;
}
