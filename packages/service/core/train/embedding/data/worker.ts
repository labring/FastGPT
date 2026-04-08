import { getWorker, QueueNames } from '../../../../common/bullmq';
import { addLog } from '../../../../common/system/log';
import { type EmbeddingTrainDataGenerateJobData } from './mq';
import { embeddingTrainDataGenerateProcessor } from './processor';
import {
  DEFAULT_WORKER_STALLED_INTERVAL,
  DEFAULT_TRAIN_DATA_GENERATE_CONCURRENCY,
  DEFAULT_WORKER_MAX_STALLED_COUNT
} from '../constants';
import {
  TrainsetGenerationUnrecoverableError,
  TrainsetGenerationRetriableError
} from '../../common/errors';
import { MongoEmbeddingTrainset } from '../trainset/schema';
import { EmbeddingTrainsetStatusEnum } from '@fastgpt/global/core/train/embedding/constants';
import {
  EmbeddingTrainErrEnum,
  EmbeddingTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import type { EnhancedErrorMessage } from '@fastgpt/global/core/train/embedding/error';
import { createEmbeddingEnhancedError } from '../utils';

export function initEmbeddingTrainDataWorker() {
  const worker = getWorker<EmbeddingTrainDataGenerateJobData>(
    QueueNames.embeddingTrainDataGenerate,
    embeddingTrainDataGenerateProcessor,
    {
      stalledInterval: DEFAULT_WORKER_STALLED_INTERVAL,
      maxStalledCount:
        global.systemEnv?.trainConfig?.maxStalledCount || DEFAULT_WORKER_MAX_STALLED_COUNT,
      concurrency:
        global.systemEnv?.trainConfig?.dataGenerateConcurrency ||
        DEFAULT_TRAIN_DATA_GENERATE_CONCURRENCY
    }
  );

  worker.on('active', (job) => {
    if (job?.data) {
      const { trainsetId, datasetIds } = job.data;
      addLog.info('[EmbeddingTrainData] Generation task started', {
        jobId: job.id,
        trainsetId,
        datasetIds
      });
    }
  });

  worker.on('completed', (job) => {
    if (job?.data) {
      const { trainsetId } = job.data;
      addLog.info('[EmbeddingTrainData] Generation task completed', {
        jobId: job.id,
        trainsetId
      });
    }
  });

  worker.on('stalled', async (jobId: string) => {
    addLog.warn('[EmbeddingTrainData] Generation task stalled, will be retried', {
      jobId
    });
  });

  worker.on('failed', async (job, error) => {
    if (job?.data) {
      const { trainsetId } = job.data;

      // Extract structured error information
      let errorMsg: EnhancedErrorMessage;

      if (
        error instanceof TrainsetGenerationUnrecoverableError ||
        error instanceof TrainsetGenerationRetriableError
      ) {
        // Use structured error from custom error classes
        errorMsg = error.enhancedError;

        addLog.error('[EmbeddingTrainData] Generation task failed', {
          jobId: job.id,
          trainsetId,
          errorType: error.name,
          errorMsg, // Log complete structured error
          attemptsMade: job.attemptsMade,
          maxAttempts: job.opts.attempts
        });
      } else {
        // Unknown error, construct basic structured error
        errorMsg = createEmbeddingEnhancedError(
          null,
          EmbeddingTrainErrEnum.embeddingUnknownError,
          EmbeddingTrainSuggestionEnum.embeddingUnknownError,
          error.stack
        );

        addLog.error('[EmbeddingTrainData] Generation task failed with unknown error', {
          jobId: job.id,
          trainsetId,
          error: error.message,
          stack: error.stack,
          attemptsMade: job.attemptsMade,
          maxAttempts: job.opts.attempts
        });
      }

      // Only persist errorMsg if this is an unrecoverable error or final retry
      const isUnrecoverable = error instanceof TrainsetGenerationUnrecoverableError;
      const isFinalRetry = job.attemptsMade >= (job.opts.attempts ?? 0);

      if (isUnrecoverable || isFinalRetry) {
        try {
          await MongoEmbeddingTrainset.updateOne(
            { _id: trainsetId },
            {
              status: EmbeddingTrainsetStatusEnum.error,
              errorMsg, // Save structured object
              updateTime: new Date()
            }
          );

          addLog.info(
            '[EmbeddingTrainData] Trainset status updated to error in MongoDB (unrecoverable or final retry)',
            {
              trainsetId,
              isUnrecoverable,
              isFinalRetry,
              attemptsMade: job.attemptsMade
            }
          );
        } catch (updateError) {
          addLog.error('[EmbeddingTrainData] Failed to update trainset status in MongoDB', {
            trainsetId,
            updateError: (updateError as Error).message
          });
        }
      } else {
        // Retriable error with remaining attempts - reset status to pending for retry
        try {
          await MongoEmbeddingTrainset.updateOne(
            { _id: trainsetId },
            {
              status: EmbeddingTrainsetStatusEnum.pending,
              updateTime: new Date()
            }
          );

          addLog.info('[EmbeddingTrainData] Retriable error, status reset to pending for retry', {
            trainsetId,
            attemptsMade: job.attemptsMade,
            remainingAttempts: (job.opts.attempts ?? 0) - job.attemptsMade
          });
        } catch (updateError) {
          addLog.error('[EmbeddingTrainData] Failed to reset trainset status for retry', {
            trainsetId,
            updateError: (updateError as Error).message
          });
        }
      }
    }
  });

  addLog.info('[EmbeddingTrainData] Worker created successfully');
  return worker;
}
