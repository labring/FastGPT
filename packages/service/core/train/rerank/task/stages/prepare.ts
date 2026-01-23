import * as fs from 'fs';
import * as path from 'path';
import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { MongoRerankTrainsetData } from '../../data/schema';
import { MongoRerankTrainset } from '../../trainset/schema';
import { addLog } from '../../../../../common/system/log';
import { createEnhancedError, formatTrainTaskError } from '../../utils';
import { getRerankTrainDataDir } from '../../constants';
import {
  RerankTrainErrEnum,
  RerankTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import {
  RerankTaskCheckpointStageEnum,
  RerankTrainsetStatusEnum
} from '@fastgpt/global/core/train/rerank/constants';
import { TrainTaskUnrecoverableError, TrainTaskRetriableError } from '../errors';
import { calculateTrainsetStats } from '../../data/controller';
import type { EnhancedErrorMessage } from '@fastgpt/global/core/train/rerank/error';

/**
 * Poll and wait for trainset to be ready
 * @param trainsetId Trainset ID
 * @param maxAttempts Max polling attempts (default: 360 for 60 minutes)
 * @param interval Polling interval in ms (default: 10000ms = 10s)
 */
async function waitForTrainsetReady(
  trainsetId: string,
  maxAttempts: number = 360,
  interval: number = 10000
): Promise<void> {
  let attempts = 0;

  addLog.info('Waiting for trainset to be ready', {
    trainsetId,
    maxAttempts,
    interval
  });

  while (attempts < maxAttempts) {
    const trainset = await MongoRerankTrainset.findById(trainsetId).lean();

    if (!trainset) {
      const enhancedError = createEnhancedError(
        RerankTaskCheckpointStageEnum.preparing,
        RerankTrainErrEnum.prepareTrainsetDeleted,
        RerankTrainSuggestionEnum.prepareTrainsetDeleted
      );
      throw new TrainTaskUnrecoverableError(enhancedError);
    }

    // If ready, validate data count and return successfully
    if (trainset.status === RerankTrainsetStatusEnum.ready) {
      const stats = await calculateTrainsetStats(String(trainset._id));
      if (stats.dataCount === 0) {
        addLog.error('No train data available in trainset', { trainsetId });
        const enhancedError = createEnhancedError(
          RerankTaskCheckpointStageEnum.preparing,
          RerankTrainErrEnum.prepareDataEmpty,
          RerankTrainSuggestionEnum.prepareDataEmpty
        );
        throw new TrainTaskUnrecoverableError(enhancedError);
      }
      addLog.info('Trainset is ready', { trainsetId, dataCount: stats.dataCount });
      return;
    }

    // If error, check error type
    if (trainset.status === RerankTrainsetStatusEnum.error) {
      const enhancedError = trainset.errorMsg as EnhancedErrorMessage;

      // Check if this is a retriable trainset generation error
      // Retriable errors: DiTing failures and database errors
      const retriableErrorTypes = [
        RerankTrainErrEnum.trainsetGenDitingFailed,
        RerankTrainErrEnum.trainsetGenDitingNoData,
        RerankTrainErrEnum.trainsetGenDatabaseError
      ];

      if (retriableErrorTypes.includes(enhancedError.type as RerankTrainErrEnum)) {
        addLog.info('Trainset generation failed with retriable error, continuing to poll', {
          trainsetId,
          errorType: enhancedError.type,
          attempts
        });
        // Continue polling - trainset generation will be retried by its worker
        await new Promise((resolve) => setTimeout(resolve, interval));
        attempts++;
        continue;
      }

      // Unrecoverable trainset error - fail the training task
      addLog.error('Trainset generation failed with unrecoverable error', {
        trainsetId,
        errorType: enhancedError.type,
        errorMessage: enhancedError.message
      });

      // Reuse trainset's enhancedError, just add the stage field
      const taskError: EnhancedErrorMessage = {
        ...enhancedError,
        stage: RerankTaskCheckpointStageEnum.preparing
      };
      throw new TrainTaskUnrecoverableError(taskError);
    }

    // If still generating or pending, continue waiting
    if (
      trainset.status === RerankTrainsetStatusEnum.generating ||
      trainset.status === RerankTrainsetStatusEnum.pending
    ) {
      addLog.info('Trainset still generating', {
        trainsetId,
        status: trainset.status,
        attempt: attempts + 1,
        maxAttempts
      });
      await new Promise((resolve) => setTimeout(resolve, interval));
      attempts++;
      continue;
    }

    // Unknown status, continue waiting
    await new Promise((resolve) => setTimeout(resolve, interval));
    attempts++;
  }

  // Timeout
  addLog.error('Trainset generation timeout', { trainsetId, maxAttempts });
  const enhancedError = createEnhancedError(
    RerankTaskCheckpointStageEnum.preparing,
    RerankTrainErrEnum.prepareTimeout,
    RerankTrainSuggestionEnum.prepareTimeout
  );
  throw new TrainTaskRetriableError(enhancedError);
}

/**
 * Stage 1: Data Preparation
 *
 * Organizes training data into JSONL format for SFT Platform upload.
 * Uses streaming to avoid memory overflow.
 * Queries data for the specific trainset associated with this task.
 *
 * @param task - Training task data
 * @returns Train dataset ID and temporary file path
 * @throws {UnrecoverableError} When no train data available
 */
export async function runPrepareStage(task: RerankTrainTaskSchemaType): Promise<{
  trainDatasetId: string;
  trainDatasetFilePath: string;
}> {
  addLog.info('Run prepare stage', { taskId: String(task._id) });

  // Wait for trainset to be ready
  await waitForTrainsetReady(String(task.trainsetId));

  // Use configurable training data directory
  const trainDataDir = getRerankTrainDataDir();

  // Ensure directory exists
  if (!fs.existsSync(trainDataDir)) {
    fs.mkdirSync(trainDataDir, { recursive: true });
  }

  const tmpFilePath = path.join(trainDataDir, `rerank_train_${task._id}_${Date.now()}.jsonl`);

  let dataCount = 0;

  try {
    const writeStream = fs.createWriteStream(tmpFilePath, { encoding: 'utf-8' });

    // Query training data for the specific trainset
    const cursor = MongoRerankTrainsetData.find({
      trainsetId: task.trainsetId
    }).cursor();

    for await (const data of cursor) {
      const jsonLine = JSON.stringify({
        query: data.query,
        pos: data.positiveDocs,
        neg: data.negativeDocs,
        id: String(dataCount)
      });

      writeStream.write(jsonLine + '\n');
      dataCount++;
    }

    await new Promise<void>((resolve, reject) => {
      writeStream.end((err: Error | null | undefined) => {
        if (err) reject(err);
        else resolve();
      });
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.preparing,
      RerankTrainErrEnum.prepareFileSystemError,
      RerankTrainSuggestionEnum.prepareFileSystemError,
      errorMsg
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  // Double-check data count after file writing
  // This is necessary even though waitForTrainsetReady checked the trainset data count,
  // because there could be issues between database query and file writing
  if (dataCount === 0) {
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.preparing,
      RerankTrainErrEnum.prepareDataEmptyAfterWrite,
      RerankTrainSuggestionEnum.prepareDataEmptyAfterWrite
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  addLog.info('Prepared train data', {
    taskId: String(task._id),
    dataCount,
    trainsetId: String(task.trainsetId),
    filePath: tmpFilePath
  });

  return {
    trainDatasetId: String(task.trainsetId),
    trainDatasetFilePath: tmpFilePath
  };
}
