import * as fs from 'fs/promises';
import * as path from 'path';
import { MongoEmbeddingTrainTask } from './schema';
import type { EmbeddingTrainTaskSchemaType } from '@fastgpt/global/core/train/embedding/type';
import type { EmbeddingTaskCheckpointStageEnum } from '@fastgpt/global/core/train/embedding/constants';
import { EmbeddingTrainTaskStatusEnum } from '@fastgpt/global/core/train/embedding/constants';
import { addLog } from '../../../../common/system/log';
import { getEmbeddingModel } from '../../../ai/model';
import type { ClientSession } from '../../../../common/mongo';
import { buildModelEndpoint } from '../utils';
import { EmbeddingTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { MongoSystemModel } from '../../../ai/config/schema';
import { deleteEmbeddingModelConfig } from '../model/controller';
import { getEmbeddingTrainDataDir } from '../constants';
import { MongoEmbeddingTrainset } from '../trainset/schema';
import { MongoEmbeddingTrainsetData } from '../data/schema';
import { MongoEvalDatasetCollection } from '../../../evaluation/dataset/evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from '../../../evaluation/dataset/evalDatasetDataSchema';
import { deleteSFTTask } from '../../common/external/sftbridge';
import { removeEmbeddingTrainTaskJob } from './mq';

/**
 * Create embedding training task
 *
 * Key logic:
 * 1. Accepts baseModelId directly
 * 2. Calls getEmbeddingModel(baseModelId) to build baseModelEndpoint
 * 3. trainsetId is optional (auto mode: written by generate_trainset stage)
 * 4. evalDatasetId and datasetIds are optional based on mode
 *
 * @param params - Task creation parameters
 * @returns Task ID
 * @throws {EmbeddingTrainErrEnum} When base model not found
 */
export async function createEmbeddingTrainTask(params: {
  baseModelId: string;
  trainsetId?: string;
  evalDatasetId?: string;
  datasetIds?: string[];
  newModelName?: string;
  teamId: string;
  tmbId: string;
  name?: string;
  trainType?: string;
}): Promise<EmbeddingTrainTaskSchemaType> {
  const {
    baseModelId,
    trainsetId,
    evalDatasetId,
    datasetIds,
    newModelName,
    teamId,
    tmbId,
    name,
    trainType
  } = params;

  // Reject disabled models
  const dbModel = await MongoSystemModel.findOne({ model: baseModelId }, 'metadata').lean();
  if (dbModel?.metadata?.isActive === false) {
    return Promise.reject(EmbeddingTrainErrEnum.embeddingTaskBaseModelDisabled);
  }

  const embeddingModel = getEmbeddingModel(baseModelId);
  if (!embeddingModel) {
    return Promise.reject(EmbeddingTrainErrEnum.embeddingTaskModelNotFound);
  }

  const baseModelEndpoint = buildModelEndpoint(embeddingModel);

  addLog.info('Creating embedding train task', {
    baseModelId,
    baseModelEndpoint
  });

  const [doc] = await MongoEmbeddingTrainTask.create([
    {
      trainsetId: trainsetId || undefined,
      evalDatasetId: evalDatasetId || undefined,
      datasetIds: datasetIds?.length ? datasetIds : undefined,
      newModelName: newModelName || undefined,
      teamId,
      tmbId,
      name: name || `Embedding Training - ${new Date().toLocaleDateString()}`,
      baseModelId,
      baseModelEndpoint,
      trainType: trainType || 'lora',
      status: EmbeddingTrainTaskStatusEnum.pending,
      checkpoint: {
        stage: null,
        data: {},
        stageEndTime: {}
      }
    }
  ]);

  addLog.info('Created embedding train task', {
    baseModelId,
    trainsetId,
    taskId: String(doc._id)
  });

  return doc.toObject() as EmbeddingTrainTaskSchemaType;
}

/** Update task status */
export async function updateEmbeddingTaskStatus(
  taskId: string,
  status: `${EmbeddingTrainTaskStatusEnum}`
): Promise<void> {
  const updateData: {
    status: `${EmbeddingTrainTaskStatusEnum}`;
    updateTime: Date;
    finishTime?: Date;
  } = {
    status,
    updateTime: new Date()
  };

  if (
    status === EmbeddingTrainTaskStatusEnum.completed ||
    status === EmbeddingTrainTaskStatusEnum.cancelled ||
    status === EmbeddingTrainTaskStatusEnum.failed
  ) {
    updateData.finishTime = new Date();
  }

  await MongoEmbeddingTrainTask.updateOne({ _id: taskId }, updateData);

  addLog.info('Updated embedding task status', { taskId, status });
}

/** Update checkpoint stage and record completion time */
export async function updateEmbeddingCheckpointStage(
  taskId: string,
  stage: `${EmbeddingTaskCheckpointStageEnum}`
): Promise<void> {
  await MongoEmbeddingTrainTask.updateOne(
    { _id: taskId },
    {
      'checkpoint.stage': stage,
      [`checkpoint.stageEndTime.${stage}`]: new Date(),
      updateTime: new Date()
    }
  );

  addLog.info('Updated embedding checkpoint stage completion', { taskId, stage });
}

/**
 * Update checkpoint data (fine-grained update)
 *
 * Supports two modes for updating checkpoint data of a specific stage:
 * 1. Full replacement (merge=false): Replaces entire stage data
 * 2. Partial merge (merge=true): Updates only specific fields within stage
 *
 * @param taskId - Task ID
 * @param stage - Checkpoint stage name
 * @param data - Data to update
 * @param merge - Whether to merge with existing data (default: false)
 */
export async function updateEmbeddingCheckpointData(
  taskId: string,
  stage:
    | 'generate_trainset'
    | 'generate_evaldataset'
    | 'eval_basemodel'
    | 'finetuning'
    | 'registering'
    | 'eval_tunedmodel',
  data: Record<string, unknown>,
  merge: boolean = false
): Promise<void> {
  if (merge) {
    const updateFields: Record<string, unknown> = { updateTime: new Date() };
    for (const [key, value] of Object.entries(data)) {
      updateFields[`checkpoint.data.${stage}.${key}`] = value;
    }
    await MongoEmbeddingTrainTask.updateOne({ _id: taskId }, updateFields);
  } else {
    await MongoEmbeddingTrainTask.updateOne(
      { _id: taskId },
      {
        [`checkpoint.data.${stage}`]: data,
        updateTime: new Date()
      }
    );
  }

  addLog.info('Updated embedding checkpoint data', {
    taskId,
    stage,
    merge,
    keys: Object.keys(data)
  });
}

/** Get embedding training task by ID */
export async function getEmbeddingTrainTask(
  taskId: string
): Promise<EmbeddingTrainTaskSchemaType | null> {
  return MongoEmbeddingTrainTask.findById(taskId).lean();
}

/**
 * Delete embedding training task with unified artifact cleanup
 *
 * Cleanup order:
 * 1. FastGPT model config + AI Proxy channel (registering stage artifact)
 * 2. SFT Bridge resources (finetuning stage artifact, async non-blocking)
 * 3. Eval dataset collections + data (generate_evaldataset stage artifact)
 * 4. Auto-generated trainset + data (generate_trainset stage artifact, auto mode only)
 * 5. Task record
 * 6. Temp JSONL files (async non-blocking)
 *
 * @param taskId - Task ID to delete
 * @param session - Optional MongoDB session for transaction
 * @throws {Error} When task not found
 */
export async function deleteEmbeddingTrainTask(
  taskId: string,
  session?: ClientSession
): Promise<void> {
  const task = await MongoEmbeddingTrainTask.findById(taskId, null, { session }).lean();
  if (!task) {
    return Promise.reject(EmbeddingTrainErrEnum.embeddingTaskNotExist);
  }

  // 1. Remove BullMQ job first to stop worker before any data cleanup
  await removeEmbeddingTrainTaskJob(taskId, { forceCleanActiveJobs: true });

  const tempFilePath = task.result?.trainDatasetFilePath;

  // 2. Clean up FastGPT model config + AI Proxy channel (registering stage artifact)
  const tunedModelId = task.checkpoint?.data?.registering?.tunedModelId;
  if (tunedModelId) {
    addLog.info('Deleting tuned model config associated with task', {
      taskId,
      tunedModelId
    });

    try {
      // Delete model config and channel only; SFT Bridge is handled separately below
      await deleteEmbeddingModelConfig(tunedModelId);
      addLog.info('Successfully deleted tuned model config', { taskId, tunedModelId });
    } catch (error) {
      addLog.warn('Failed to delete tuned model config, continuing with task deletion', {
        taskId,
        tunedModelId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // 3. Clean up SFT Bridge resources (async non-blocking)
  const sftTaskId = task.checkpoint?.data?.finetuning?.sftTaskId;
  if (sftTaskId) {
    setImmediate(() => {
      deleteSFTTask({ taskId: sftTaskId }).catch((err) => {
        addLog.warn('Failed to delete SFT task from SFT Bridge', {
          taskId,
          sftTaskId,
          error: String(err)
        });
      });
    });
    addLog.info('Triggered async SFT task deletion', { taskId, sftTaskId });
  }

  // 4. Clean up auto-generated eval dataset + data (only if this task auto-generated it)
  if (task.checkpoint?.data?.generate_evaldataset?.autoGenerated) {
    const evalCollections = await MongoEvalDatasetCollection.find(
      { 'metadata.taskId': taskId },
      null,
      { session }
    ).lean();

    if (evalCollections.length > 0) {
      const collectionIds = evalCollections.map((col) => col._id);

      const deletedDataResult = await MongoEvalDatasetData.deleteMany(
        { evalDatasetCollectionId: { $in: collectionIds } },
        { session }
      );
      addLog.info('Deleted eval dataset data for task', {
        taskId,
        deletedCount: deletedDataResult.deletedCount
      });

      const deletedCollectionResult = await MongoEvalDatasetCollection.deleteMany(
        { _id: { $in: collectionIds } },
        { session }
      );
      addLog.info('Deleted eval dataset collections for task', {
        taskId,
        deletedCount: deletedCollectionResult.deletedCount
      });
    }
  }

  // 5. Clean up auto-generated trainset + data (only if this task auto-generated it)
  const autoTrainsetId =
    task.checkpoint?.data?.generate_trainset?.autoGenerated && task.trainsetId
      ? String(task.trainsetId)
      : undefined;
  if (autoTrainsetId) {
    try {
      const deletedTrainData = await MongoEmbeddingTrainsetData.deleteMany(
        { trainsetId: autoTrainsetId },
        { session }
      );
      await MongoEmbeddingTrainset.deleteOne({ _id: autoTrainsetId }, { session });
      addLog.info('Deleted auto-generated trainset and data', {
        taskId,
        trainsetId: autoTrainsetId,
        deletedDataCount: deletedTrainData.deletedCount
      });
    } catch (error) {
      addLog.warn('Failed to delete auto-generated trainset, continuing', {
        taskId,
        trainsetId: autoTrainsetId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // 6. Delete task record
  await MongoEmbeddingTrainTask.deleteOne({ _id: taskId }, { session });
  addLog.info('Deleted embedding train task', { taskId });

  // 7. Clean up temp files (async non-blocking)
  if (tempFilePath) {
    setImmediate(() => {
      cleanupEmbeddingTempFiles(tempFilePath).catch((error) => {
        addLog.warn('Failed to cleanup temp files after task deletion', {
          taskId,
          tempFilePath,
          error: (error as Error).message
        });
      });
    });
  }
}

/** Cancel embedding training task */
export async function cancelEmbeddingTrainTask(taskId: string): Promise<void> {
  const task = await MongoEmbeddingTrainTask.findById(taskId).lean();
  if (!task) {
    return Promise.reject(EmbeddingTrainErrEnum.embeddingTaskNotExist);
  }

  if (
    task.status === EmbeddingTrainTaskStatusEnum.completed ||
    task.status === EmbeddingTrainTaskStatusEnum.failed ||
    task.status === EmbeddingTrainTaskStatusEnum.cancelled
  ) {
    return Promise.reject(EmbeddingTrainErrEnum.embeddingTaskCannotCancel);
  }

  // Remove BullMQ job (force clean if active)
  await removeEmbeddingTrainTaskJob(taskId, { forceCleanActiveJobs: true });

  // Cancel SFT task if finetuning has started (async non-blocking)
  const sftTaskId = task.checkpoint?.data?.finetuning?.sftTaskId;
  if (sftTaskId) {
    setImmediate(() => {
      deleteSFTTask({ taskId: sftTaskId }).catch((err) => {
        addLog.warn('Failed to cancel SFT task during task cancellation', {
          taskId,
          sftTaskId,
          error: String(err)
        });
      });
    });
    addLog.info('Triggered async SFT task cancellation', { taskId, sftTaskId });
  }

  await updateEmbeddingTaskStatus(taskId, EmbeddingTrainTaskStatusEnum.cancelled);

  addLog.info('Cancelled embedding train task', { taskId });
}

/**
 * Clean up temporary files related to embedding training task
 *
 * @param filePath - Optional temp file path to delete
 * @param taskId - Optional task ID to generate file pattern for cleanup
 */
export async function cleanupEmbeddingTempFiles(filePath?: string, taskId?: string): Promise<void> {
  if (!filePath && !taskId) {
    addLog.warn('Both filePath and taskId are not provided for cleanup');
    return;
  }

  try {
    if (filePath) {
      await fs.unlink(filePath);
      addLog.info('Cleaned up temp file', { filePath });
    } else if (taskId) {
      // Use configurable training data directory
      const trainDataDir = getEmbeddingTrainDataDir();
      const files = await fs.readdir(trainDataDir);
      const tempFilePattern = new RegExp(`^embedding_train_${taskId}_\\d+\\.jsonl$`);

      for (const file of files) {
        if (tempFilePattern.test(file)) {
          const targetPath = path.join(trainDataDir, file);
          await fs.unlink(targetPath);
          addLog.info('Cleaned up temp file', { taskId, filePath: targetPath });
        }
      }
    }
  } catch (error) {
    addLog.warn('Failed to cleanup temp files', {
      filePath,
      taskId,
      error: (error as Error).message
    });
  }
}

/**
 * Traverse the training task chain upward by tunedModelId.
 * Returns tasks in order from the given tunedModelId up to the root base model.
 * Includes cycle detection and depth limit to prevent infinite loops.
 */
export async function resolveEmbeddingTasksByTunedModelId(
  tunedModelId: string,
  teamId: string
): Promise<EmbeddingTrainTaskSchemaType[]> {
  const result: EmbeddingTrainTaskSchemaType[] = [];
  const visited = new Set<string>();
  let currentId = tunedModelId;
  const MAX_DEPTH = 100;

  while (result.length < MAX_DEPTH) {
    if (visited.has(currentId)) {
      addLog.warn('Cycle detected in task chain traversal', { tunedModelId, currentId, teamId });
      break;
    }
    visited.add(currentId);

    const task = await MongoEmbeddingTrainTask.findOne({
      teamId,
      'checkpoint.data.registering.tunedModelId': currentId
    }).lean();

    if (!task) {
      break;
    }

    result.push(task);
    currentId = task.baseModelId;
  }

  return result;
}
