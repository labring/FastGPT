import * as fs from 'fs';
import * as path from 'path';
import type { EmbeddingTrainTaskSchemaType } from '@fastgpt/global/core/train/embedding/type';
import { MongoEmbeddingTrainsetData } from '../../data/schema';
import { MongoEmbeddingTrainset } from '../../trainset/schema';
import { addLog } from '../../../../../common/system/log';
import { createEmbeddingEnhancedError, formatTrainTaskError } from '../../utils';
import { getEmbeddingTrainDataDir } from '../../constants';
import {
  EmbeddingTrainErrEnum,
  EmbeddingTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import {
  EmbeddingTaskCheckpointStageEnum,
  EmbeddingTrainsetStatusEnum
} from '@fastgpt/global/core/train/embedding/constants';
import { TrainTaskUnrecoverableError, TrainTaskRetriableError } from '../../../common/errors';
import { calculateEmbeddingTrainsetStats } from '../../data/controller';
import type { EnhancedErrorMessage } from '@fastgpt/global/core/train/embedding/error';
import { createEmbeddingTrainset } from '../../trainset/controller';
import { MongoEmbeddingTrainTask } from '../schema';
import { embeddingTrainDataGenerateQueue } from '../../data/mq';

/**
 * Poll and wait for embedding trainset to be ready
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

  addLog.info('Waiting for embedding trainset to be ready', {
    trainsetId,
    maxAttempts,
    interval
  });

  while (attempts < maxAttempts) {
    const trainset = await MongoEmbeddingTrainset.findById(trainsetId).lean();

    if (!trainset) {
      const enhancedError = createEmbeddingEnhancedError(
        EmbeddingTaskCheckpointStageEnum.generate_trainset,
        EmbeddingTrainErrEnum.embeddingPrepareTrainsetDeleted,
        EmbeddingTrainSuggestionEnum.embeddingPrepareTrainsetDeleted
      );
      throw new TrainTaskUnrecoverableError(enhancedError);
    }

    // If ready, validate data count and return successfully
    if (trainset.status === EmbeddingTrainsetStatusEnum.ready) {
      const stats = await calculateEmbeddingTrainsetStats(String(trainset._id));
      if (stats.dataCount === 0) {
        addLog.error('No train data available in embedding trainset', { trainsetId });
        const enhancedError = createEmbeddingEnhancedError(
          EmbeddingTaskCheckpointStageEnum.generate_trainset,
          EmbeddingTrainErrEnum.embeddingPrepareDataEmpty,
          EmbeddingTrainSuggestionEnum.embeddingPrepareDataEmpty
        );
        throw new TrainTaskUnrecoverableError(enhancedError);
      }
      addLog.info('Embedding trainset is ready', { trainsetId, dataCount: stats.dataCount });
      return;
    }

    // If error, fail the training task immediately
    if (trainset.status === EmbeddingTrainsetStatusEnum.error) {
      const enhancedError = trainset.errorMsg as EnhancedErrorMessage;

      addLog.error('Embedding trainset generation failed', {
        trainsetId,
        errorType: enhancedError.type,
        errorMessage: enhancedError.message
      });

      // Reuse trainset's enhancedError, just add the stage field
      const taskError: EnhancedErrorMessage = {
        ...enhancedError,
        stage: EmbeddingTaskCheckpointStageEnum.generate_trainset
      };
      throw new TrainTaskUnrecoverableError(taskError);
    }

    // If still generating or pending, continue waiting
    if (
      trainset.status === EmbeddingTrainsetStatusEnum.generating ||
      trainset.status === EmbeddingTrainsetStatusEnum.pending
    ) {
      addLog.info('Embedding trainset still generating', {
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
  addLog.error('Embedding trainset generation timeout', { trainsetId, maxAttempts });
  const enhancedError = createEmbeddingEnhancedError(
    EmbeddingTaskCheckpointStageEnum.generate_trainset,
    EmbeddingTrainErrEnum.embeddingPrepareTimeout,
    EmbeddingTrainSuggestionEnum.embeddingPrepareTimeout
  );
  throw new TrainTaskRetriableError(enhancedError);
}

/**
 * Generate embedding trainset JSONL file from trainset data
 *
 * Organizes training data into JSONL format for SFT Platform upload.
 * Uses streaming to avoid memory overflow.
 * Format: {query, pos, neg, id} — same as rerank.
 *
 * @param task - Embedding training task data
 * @returns Train dataset ID and temporary file path
 * @throws {TrainTaskUnrecoverableError} When no train data available
 */
async function generateTrainsetJsonl(task: EmbeddingTrainTaskSchemaType): Promise<{
  trainDatasetId: string;
  trainDatasetFilePath: string;
}> {
  // Use configurable training data directory
  const trainDataDir = getEmbeddingTrainDataDir();

  // Ensure directory exists
  if (!fs.existsSync(trainDataDir)) {
    fs.mkdirSync(trainDataDir, { recursive: true });
  }

  const tmpFilePath = path.join(trainDataDir, `embedding_train_${task._id}_${Date.now()}.jsonl`);

  let dataCount = 0;

  try {
    const writeStream = fs.createWriteStream(tmpFilePath, { encoding: 'utf-8' });

    // Query training data for the specific trainset
    const cursor = MongoEmbeddingTrainsetData.find({
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
    const enhancedError = createEmbeddingEnhancedError(
      EmbeddingTaskCheckpointStageEnum.generate_trainset,
      EmbeddingTrainErrEnum.embeddingPrepareFileSystemError,
      EmbeddingTrainSuggestionEnum.embeddingPrepareFileSystemError,
      errorMsg
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  // Double-check data count after file writing
  if (dataCount === 0) {
    const enhancedError = createEmbeddingEnhancedError(
      EmbeddingTaskCheckpointStageEnum.generate_trainset,
      EmbeddingTrainErrEnum.embeddingPrepareDataEmptyAfterWrite,
      EmbeddingTrainSuggestionEnum.embeddingPrepareDataEmptyAfterWrite
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  addLog.info('Prepared embedding train data', {
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
 * @param task - Embedding training task data
 * @returns Train dataset ID and temporary file path
 */
export async function runGenerateTrainsetStage(task: EmbeddingTrainTaskSchemaType): Promise<{
  trainDatasetId: string;
  trainDatasetFilePath: string;
  autoGenerated: boolean;
}> {
  addLog.info('Run generate trainset stage (embedding)', { taskId: String(task._id) });

  let trainsetId = task.trainsetId ? String(task.trainsetId) : undefined;
  let autoGenerated = false;

  if (!trainsetId) {
    // Auto mode: create new trainset and trigger data generation
    autoGenerated = true;
    addLog.info('Auto mode: creating new embedding trainset', { taskId: String(task._id) });

    const trainset = await createEmbeddingTrainset({
      teamId: String(task.teamId),
      tmbId: String(task.tmbId),
      name: `Training Set - ${task.name}`,
      description: `Auto-generated for embedding training task ${task._id}`
    });
    trainsetId = String(trainset._id);

    // Write trainsetId back to task top-level field
    await MongoEmbeddingTrainTask.updateOne({ _id: task._id }, { trainsetId });

    addLog.info('Auto mode: created embedding trainset, triggering data generation', {
      taskId: String(task._id),
      trainsetId
    });

    // generateConfig is required in auto mode; guard here to surface programming errors early
    if (!task.generateConfig) {
      const enhancedError = createEmbeddingEnhancedError(
        EmbeddingTaskCheckpointStageEnum.generate_trainset,
        EmbeddingTrainErrEnum.embeddingPrepareMissingGenerateConfig,
        EmbeddingTrainSuggestionEnum.embeddingPrepareMissingGenerateConfig
      );
      throw new TrainTaskUnrecoverableError(enhancedError);
    }

    // Trigger data generation queue
    const job = await embeddingTrainDataGenerateQueue.add(`generate-trainset-${trainsetId}`, {
      trainsetId,
      datasetIds: task.datasetIds,
      generateConfig: task.generateConfig
    });

    // Write jobId back to trainset for retry support
    if (job.id) {
      await MongoEmbeddingTrainset.updateOne({ _id: trainsetId }, { jobId: job.id });
    }
  } else {
    addLog.info('Exact mode: using existing embedding trainset', {
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
