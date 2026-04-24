import { getWorker, QueueNames } from '../../../../common/bullmq';
import { addLog } from '../../../../common/system/log';
import { type RerankTrainDataGenerateJobData } from './mq';
import { rerankTrainDataGenerateProcessor } from './processor';
import { trainEnv } from '../../common/env';
import {
  TrainsetGenerationUnrecoverableError,
  TrainsetGenerationRetriableError
} from '../../common/errors';
import { MongoRerankTrainset } from '../trainset/schema';
import { RerankTrainsetStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import {
  RerankTrainErrEnum,
  RerankTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import type { EnhancedErrorMessage } from '@fastgpt/global/core/train/rerank/error';
import { createRerankEnhancedError } from '../utils';

export function initRerankTrainDataWorker() {
  const worker = getWorker<RerankTrainDataGenerateJobData>(
    QueueNames.rerankTrainDataGenerate,
    rerankTrainDataGenerateProcessor,
    {
      stalledInterval: trainEnv.TRAIN_WORKER_STALLED_INTERVAL,
      maxStalledCount:
        global.systemEnv?.trainConfig?.maxStalledCount || trainEnv.TRAIN_WORKER_MAX_STALLED_COUNT,
      concurrency:
        global.systemEnv?.trainConfig?.dataGenerateConcurrency ||
        trainEnv.TRAIN_DATA_GENERATE_CONCURRENCY
    }
  );

  worker.on('active', (job) => {
    if (job?.data) {
      const { trainsetId, datasetIds } = job.data;
      addLog.info('[RerankTrainData] Generation task started', {
        jobId: job.id,
        trainsetId,
        datasetIds
      });
    }
  });

  worker.on('completed', (job) => {
    if (job?.data) {
      const { trainsetId } = job.data;
      addLog.info('[RerankTrainData] Generation task completed', {
        jobId: job.id,
        trainsetId
      });
    }
  });

  worker.on('stalled', async (jobId: string) => {
    addLog.warn('[RerankTrainData] Generation task stalled, will be retried', {
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

        addLog.error('[RerankTrainData] Generation task failed', {
          jobId: job.id,
          trainsetId,
          errorType: error.name,
          errorMsg, // Log complete structured error
          attemptsMade: job.attemptsMade,
          maxAttempts: job.opts.attempts
        });
      } else {
        // Unknown error, construct basic structured error
        errorMsg = createRerankEnhancedError(
          null,
          RerankTrainErrEnum.rerankUnknownError,
          RerankTrainSuggestionEnum.rerankUnknownError,
          error.stack
        );

        addLog.error('[RerankTrainData] Generation task failed with unknown error', {
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
          await MongoRerankTrainset.updateOne(
            { _id: trainsetId },
            {
              status: RerankTrainsetStatusEnum.error,
              errorMsg, // Save structured object
              updateTime: new Date()
            }
          );

          addLog.info(
            '[RerankTrainData] Trainset status updated to error in MongoDB (unrecoverable or final retry)',
            {
              trainsetId,
              isUnrecoverable,
              isFinalRetry,
              attemptsMade: job.attemptsMade
            }
          );
        } catch (updateError) {
          addLog.error('[RerankTrainData] Failed to update trainset status in MongoDB', {
            trainsetId,
            updateError: (updateError as Error).message
          });
        }
      } else {
        // Retriable error with remaining attempts - reset status to pending for retry
        try {
          await MongoRerankTrainset.updateOne(
            { _id: trainsetId },
            {
              status: RerankTrainsetStatusEnum.pending,
              updateTime: new Date()
            }
          );

          addLog.info('[RerankTrainData] Retriable error, status reset to pending for retry', {
            trainsetId,
            attemptsMade: job.attemptsMade,
            remainingAttempts: (job.opts.attempts ?? 0) - job.attemptsMade
          });
        } catch (updateError) {
          addLog.error('[RerankTrainData] Failed to reset trainset status for retry', {
            trainsetId,
            updateError: (updateError as Error).message
          });
        }
      }
    }
  });

  addLog.info('[RerankTrainData] Worker created successfully');
  return worker;
}
