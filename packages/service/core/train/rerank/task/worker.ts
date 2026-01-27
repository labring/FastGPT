import { getWorker, QueueNames } from '../../../../common/bullmq';
import { addLog } from '../../../../common/system/log';
import { type RerankTrainTaskJobData } from './mq';
import { rerankTrainTaskProcessor } from './processor';
import { MongoRerankTrainTask } from './schema';
import { RerankTrainTaskStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import {
  DEFAULT_WORKER_STALLED_INTERVAL,
  DEFAULT_TRAIN_TASK_CONCURRENCY,
  DEFAULT_WORKER_MAX_STALLED_COUNT
} from '../constants';
import { TrainTaskUnrecoverableError, TrainTaskRetriableError } from './errors';
import {
  RerankTrainErrEnum,
  RerankTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import type { EnhancedErrorMessage } from '@fastgpt/global/core/train/rerank/error';
import { createEnhancedError } from '../utils';

export function initRerankTrainTaskWorker() {
  const worker = getWorker<RerankTrainTaskJobData>(
    QueueNames.rerankTrainTask,
    rerankTrainTaskProcessor,
    {
      stalledInterval: DEFAULT_WORKER_STALLED_INTERVAL,
      maxStalledCount:
        global.systemEnv?.trainConfig?.maxStalledCount || DEFAULT_WORKER_MAX_STALLED_COUNT,
      concurrency: global.systemEnv?.trainConfig?.taskConcurrency || DEFAULT_TRAIN_TASK_CONCURRENCY
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

      // Extract structured error information
      let errorMsg: EnhancedErrorMessage;

      if (
        error instanceof TrainTaskUnrecoverableError ||
        error instanceof TrainTaskRetriableError
      ) {
        // Use structured error from custom error classes
        errorMsg = error.enhancedError;

        addLog.error('[RerankTrainTask] Task failed', {
          jobId: job.id,
          taskId,
          errorType: error.name,
          errorMsg // Log complete structured error
        });
      } else {
        // Unknown error, construct basic structured error
        errorMsg = createEnhancedError(
          null,
          RerankTrainErrEnum.unknownError,
          RerankTrainSuggestionEnum.unknownError,
          error.stack
        );

        addLog.error('[RerankTrainTask] Task failed with unknown error', {
          jobId: job.id,
          taskId,
          error: error.message,
          stack: error.stack
        });
      }

      try {
        await MongoRerankTrainTask.updateOne(
          { _id: taskId },
          {
            status: RerankTrainTaskStatusEnum.failed,
            errorMsg, // Save structured object
            updateTime: new Date(),
            finishTime: new Date()
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
