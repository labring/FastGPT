import { getWorker, QueueNames } from '../../../../common/bullmq';
import { addLog } from '../../../../common/system/log';
import { type RerankTrainDataGenerateJobData } from './mq';
import { rerankTrainDataGenerateProcessor } from './processor';
import {
  DEFAULT_WORKER_STALLED_INTERVAL,
  DEFAULT_TRAIN_DATA_GENERATE_CONCURRENCY,
  DEFAULT_WORKER_MAX_STALLED_COUNT
} from '../constants';
import {
  TrainsetGenerationUnrecoverableError,
  TrainsetGenerationRetriableError
} from '../trainset/errors';
import { MongoRerankTrainset } from '../trainset/schema';
import { RerankTrainsetStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import {
  RerankTrainErrEnum,
  RerankTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import type { EnhancedErrorMessage } from '@fastgpt/global/core/train/rerank/error';
import { createEnhancedError } from '../utils';

export function initRerankTrainDataWorker() {
  const worker = getWorker<RerankTrainDataGenerateJobData>(
    QueueNames.rerankTrainDataGenerate,
    rerankTrainDataGenerateProcessor,
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
      const { trainsetId, appId } = job.data;
      addLog.info('[RerankTrainData] Generation task started', {
        jobId: job.id,
        trainsetId,
        appId
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

        addLog.error('[RerankTrainData] Generation task failed with unknown error', {
          jobId: job.id,
          trainsetId,
          error: error.message,
          stack: error.stack
        });
      }

      try {
        await MongoRerankTrainset.updateOne(
          { _id: trainsetId },
          {
            status: RerankTrainsetStatusEnum.error,
            errorMsg, // Save structured object
            updateTime: new Date()
          }
        );

        addLog.info('[RerankTrainData] Trainset status updated to error in MongoDB', {
          trainsetId
        });
      } catch (updateError) {
        addLog.error('[RerankTrainData] Failed to update trainset status in MongoDB', {
          trainsetId,
          updateError: (updateError as Error).message
        });
      }
    }
  });

  addLog.info('[RerankTrainData] Worker created successfully');
  return worker;
}
