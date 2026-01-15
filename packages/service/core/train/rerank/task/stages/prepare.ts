import * as fs from 'fs';
import * as path from 'path';
import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { MongoRerankTrainsetData } from '../../data/schema';
import { MongoRerankTrainset } from '../../trainset/schema';
import { addLog } from '../../../../../common/system/log';
import { createEnhancedError } from '../../utils';
import { getRerankTrainDataDir } from '../../constants';
import { TrainTaskErrorType } from '@fastgpt/global/core/train/rerank/error';
import {
  RerankTaskCheckpointStageEnum,
  RerankTrainsetStatusEnum
} from '@fastgpt/global/core/train/rerank/constants';
import { TrainTaskUnrecoverableError, TrainTaskRetriableError } from '../errors';
import { calculateTrainsetStats } from '../../data/controller';

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
        TrainTaskErrorType.INTERNAL_ERROR,
        'Trainset not found or has been deleted',
        'Please check if the trainset ID is correct'
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
          TrainTaskErrorType.DATA_EMPTY,
          'No train data available in trainset',
          'Please ensure the trainset contains training data'
        );
        throw new TrainTaskUnrecoverableError(enhancedError);
      }
      addLog.info('Trainset is ready', { trainsetId, dataCount: stats.dataCount });
      return;
    }

    // If error, throw unrecoverable error
    if (trainset.status === RerankTrainsetStatusEnum.error) {
      const errorMsg = trainset.errorMsg || 'Trainset generation failed';
      addLog.error('Trainset generation failed', { trainsetId, errorMsg });
      const enhancedError = createEnhancedError(
        RerankTaskCheckpointStageEnum.preparing,
        TrainTaskErrorType.INTERNAL_ERROR,
        `Trainset generation failed: ${errorMsg}`,
        'Please check trainset generation logs and retry'
      );
      throw new TrainTaskUnrecoverableError(enhancedError);
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
    TrainTaskErrorType.TIMEOUT,
    `Trainset generation timeout after ${maxAttempts} attempts`,
    'Trainset generation is taking longer than expected, please check the trainset status or contact administrator'
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
      TrainTaskErrorType.FILE_SYSTEM_ERROR,
      `Failed to prepare training data file: ${errorMsg}`,
      'This may be a file system permission issue. Please check system logs and available disk space',
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
      TrainTaskErrorType.DATA_EMPTY,
      'Training data is empty, cannot start training',
      'Please generate training data or manually add training samples first'
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
