import { getWorker, QueueNames } from '../../../../common/bullmq';
import { addLog } from '../../../../common/system/log';
import { type EmbeddingTrainTaskJobData } from './mq';
import { embeddingTrainTaskProcessor } from './processor';
import { MongoEmbeddingTrainTask } from './schema';
import { EmbeddingTrainTaskStatusEnum } from '@fastgpt/global/core/train/embedding/constants';
import {
  DEFAULT_WORKER_STALLED_INTERVAL,
  DEFAULT_TRAIN_TASK_CONCURRENCY,
  DEFAULT_WORKER_MAX_STALLED_COUNT
} from '../constants';
import { TrainTaskUnrecoverableError, TrainTaskRetriableError } from '../../common/errors';
import {
  EmbeddingTrainErrEnum,
  EmbeddingTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import type { EnhancedErrorMessage } from '@fastgpt/global/core/train/embedding/error';
import { createEmbeddingEnhancedError } from '../utils';

export function initEmbeddingTrainTaskWorker() {
  const worker = getWorker<EmbeddingTrainTaskJobData>(
    QueueNames.embeddingTrainTask,
    embeddingTrainTaskProcessor,
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
      addLog.info('[EmbeddingTrainTask] Task started', {
        jobId: job.id,
        taskId
      });
    }
  });

  worker.on('completed', (job) => {
    if (job?.data) {
      const { taskId } = job.data;
      addLog.info('[EmbeddingTrainTask] Task completed', {
        jobId: job.id,
        taskId
      });
    }
  });

  worker.on('stalled', async (jobId: string) => {
    addLog.warn('[EmbeddingTrainTask] Task stalled, will be retried', {
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

        addLog.error('[EmbeddingTrainTask] Task failed', {
          jobId: job.id,
          taskId,
          errorType: error.name,
          errorMsg // Log complete structured error
        });
      } else {
        // Unknown error, construct basic structured error
        errorMsg = createEmbeddingEnhancedError(
          null,
          EmbeddingTrainErrEnum.embeddingUnknownError,
          EmbeddingTrainSuggestionEnum.embeddingUnknownError,
          error.stack
        );

        addLog.error('[EmbeddingTrainTask] Task failed with unknown error', {
          jobId: job.id,
          taskId,
          error: error.message,
          stack: error.stack
        });
      }

      try {
        await MongoEmbeddingTrainTask.updateOne(
          { _id: taskId },
          {
            status: EmbeddingTrainTaskStatusEnum.failed,
            errorMsg, // Save structured object
            updateTime: new Date(),
            finishTime: new Date()
          }
        );

        addLog.info('[EmbeddingTrainTask] Task status updated to failed in MongoDB', {
          taskId
        });
      } catch (updateError) {
        addLog.error('[EmbeddingTrainTask] Failed to update task status in MongoDB', {
          taskId,
          updateError: (updateError as Error).message
        });
      }
    }
  });

  addLog.info('[EmbeddingTrainTask] Worker created successfully');
  return worker;
}
