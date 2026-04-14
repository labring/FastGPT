import * as fs from 'fs';
import * as path from 'path';
import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { MongoRerankTrainsetData } from '../../data/schema';
import { MongoRerankTrainset } from '../../trainset/schema';
import { addLog } from '../../../../../common/system/log';
import { createRerankEnhancedError, formatTrainTaskError } from '../../utils';
import { getRerankTrainDataDir } from '../../constants';
import {
  RerankTrainErrEnum,
  RerankTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import {
  RerankTaskCheckpointStageEnum,
  RerankTrainsetStatusEnum
} from '@fastgpt/global/core/train/rerank/constants';
import { TrainTaskUnrecoverableError, TrainTaskRetriableError } from '../../../common/errors';
import { calculateRerankTrainsetStats } from '../../data/controller';
import type { EnhancedErrorMessage } from '@fastgpt/global/core/train/rerank/error';
import { createRerankTrainset } from '../../trainset/controller';
import { MongoRerankTrainTask } from '../schema';
import { rerankTrainDataGenerateQueue } from '../../data/mq';

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

  addLog.info('Waiting for rerank trainset to be ready', {
    trainsetId,
    maxAttempts,
    interval
  });

  while (attempts < maxAttempts) {
    const trainset = await MongoRerankTrainset.findById(trainsetId).lean();

    if (!trainset) {
      const enhancedError = createRerankEnhancedError(
        RerankTaskCheckpointStageEnum.generate_trainset,
        RerankTrainErrEnum.rerankPrepareTrainsetDeleted,
        RerankTrainSuggestionEnum.rerankPrepareTrainsetDeleted
      );
      throw new TrainTaskUnrecoverableError(enhancedError);
    }

    // If ready, validate data count and return successfully
    if (trainset.status === RerankTrainsetStatusEnum.ready) {
      const stats = await calculateRerankTrainsetStats(String(trainset._id));
      if (stats.dataCount === 0) {
        addLog.error('No train data available in rerank trainset', { trainsetId });
        const enhancedError = createRerankEnhancedError(
          RerankTaskCheckpointStageEnum.generate_trainset,
          RerankTrainErrEnum.rerankPrepareDataEmpty,
          RerankTrainSuggestionEnum.rerankPrepareDataEmpty
        );
        throw new TrainTaskUnrecoverableError(enhancedError);
      }
      addLog.info('Rerank trainset is ready', { trainsetId, dataCount: stats.dataCount });
      return;
    }

    // If error, fail the training task immediately
    if (trainset.status === RerankTrainsetStatusEnum.error) {
      const enhancedError = trainset.errorMsg as EnhancedErrorMessage;

      addLog.error('Rerank trainset generation failed', {
        trainsetId,
        errorType: enhancedError.type,
        errorMessage: enhancedError.message
      });

      // Reuse trainset's enhancedError, just add the stage field
      const taskError: EnhancedErrorMessage = {
        ...enhancedError,
        stage: RerankTaskCheckpointStageEnum.generate_trainset
      };
      throw new TrainTaskUnrecoverableError(taskError);
    }

    // If still generating or pending, continue waiting
    if (
      trainset.status === RerankTrainsetStatusEnum.generating ||
      trainset.status === RerankTrainsetStatusEnum.pending
    ) {
      addLog.info('Rerank trainset still generating', {
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
  addLog.error('Rerank trainset generation timeout', { trainsetId, maxAttempts });
  const enhancedError = createRerankEnhancedError(
    RerankTaskCheckpointStageEnum.generate_trainset,
    RerankTrainErrEnum.rerankPrepareTimeout,
    RerankTrainSuggestionEnum.rerankPrepareTimeout
  );
  throw new TrainTaskRetriableError(enhancedError);
}

/**
 * Generate trainset JSONL file from trainset data
 *
 * Organizes training data into JSONL format for SFT Platform upload.
 * Uses streaming to avoid memory overflow.
 *
 * @param task - Training task data
 * @returns Train dataset ID and temporary file path
 * @throws {UnrecoverableError} When no train data available
 */
async function generateTrainsetJsonl(task: RerankTrainTaskSchemaType): Promise<{
  trainDatasetId: string;
  trainDatasetFilePath: string;
}> {
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
    const enhancedError = createRerankEnhancedError(
      RerankTaskCheckpointStageEnum.generate_trainset,
      RerankTrainErrEnum.rerankPrepareFileSystemError,
      RerankTrainSuggestionEnum.rerankPrepareFileSystemError,
      errorMsg
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  // Double-check data count after file writing
  if (dataCount === 0) {
    const enhancedError = createRerankEnhancedError(
      RerankTaskCheckpointStageEnum.generate_trainset,
      RerankTrainErrEnum.rerankPrepareDataEmptyAfterWrite,
      RerankTrainSuggestionEnum.rerankPrepareDataEmptyAfterWrite
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  addLog.info('Prepared rerank train data', {
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

/**
 * Stage 1: Generate Training Set
 *
 * - Auto mode (task.trainsetId is empty): Creates a new trainset, writes trainsetId back to task,
 *   triggers data generation queue, then waits for trainset to be ready.
 * - Exact mode (task.trainsetId is non-empty): Directly waits for trainset to be ready.
 *
 * Both modes then generate the JSONL file.
 *
 * @param task - Training task data
 * @returns Train dataset ID and temporary file path
 */
export async function runGenerateTrainsetStage(task: RerankTrainTaskSchemaType): Promise<{
  trainDatasetId: string;
  trainDatasetFilePath: string;
  autoGenerated: boolean;
}> {
  addLog.info('Run generate trainset stage (rerank)', { taskId: String(task._id) });

  let trainsetId = task.trainsetId ? String(task.trainsetId) : undefined;
  let autoGenerated = false;

  if (!trainsetId) {
    // Auto mode: create new trainset and trigger data generation
    autoGenerated = true;
    addLog.info('Auto mode: creating new rerank trainset', { taskId: String(task._id) });

    const trainset = await createRerankTrainset({
      teamId: String(task.teamId),
      tmbId: String(task.tmbId),
      name: `Training Set - ${task.name}`,
      description: `Auto-generated for training task ${task._id}`
    });
    trainsetId = String(trainset._id);

    // Write trainsetId back to task top-level field
    await MongoRerankTrainTask.updateOne({ _id: task._id }, { trainsetId });

    addLog.info('Auto mode: created rerank trainset, triggering data generation', {
      taskId: String(task._id),
      trainsetId
    });

    // Trigger data generation queue
    const job = await rerankTrainDataGenerateQueue.add(`generate-trainset-${trainsetId}`, {
      trainsetId,
      datasetIds: task.datasetIds
    });

    // Write jobId back to trainset for retry support
    if (job.id) {
      await MongoRerankTrainset.updateOne({ _id: trainsetId }, { jobId: job.id });
    }
  } else {
    addLog.info('Exact mode: using existing rerank trainset', {
      taskId: String(task._id),
      trainsetId
    });
  }

  // Wait for trainset to be ready (both modes)
  await waitForTrainsetReady(trainsetId);

  // Generate JSONL file from trainset data
  const jsonlResult = await generateTrainsetJsonl({ ...task, trainsetId });
  return { ...jsonlResult, autoGenerated };
}
