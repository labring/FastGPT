import * as fs from 'fs/promises';
import * as path from 'path';
import { MongoRerankTrainTask } from './schema';
import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import type { RerankTaskCheckpointStageEnum } from '@fastgpt/global/core/train/rerank/constants';
import { RerankTrainTaskStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { addLog } from '../../../../common/system/log';
import { getRerankModel } from '../../../ai/model';
import type { ClientSession } from '../../../../common/mongo';
import { MongoEvalDatasetCollection } from '../../../evaluation/dataset/evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from '../../../evaluation/dataset/evalDatasetDataSchema';
import { buildModelEndpoint } from '../utils';
import { deleteRerankModelConfig } from '../model/controller';
import { getRerankTrainDataDir } from '../constants';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';

/**
 * Create rerank training task (decoupled from App)
 *
 * Key logic:
 * 1. Accepts baseModelId directly (no App workflow extraction)
 * 2. Calls getRerankModel(baseModelId) to build baseModelEndpoint
 * 3. trainsetId is optional (auto mode: written by generate_trainset stage)
 * 4. evalDatasetId and datasetIds are optional based on mode
 *
 * @param params - Task creation parameters
 * @returns Task ID
 * @throws {RerankTrainErrEnum} When base model not found
 */
export async function createRerankTrainTask(params: {
  baseModelId: string;
  trainsetId?: string;
  evalDatasetId?: string;
  datasetIds?: string[];
  newModelName?: string;
  teamId: string;
  tmbId: string;
  name?: string;
}): Promise<string> {
  const { baseModelId, trainsetId, evalDatasetId, datasetIds, newModelName, teamId, tmbId, name } =
    params;

  const rerankModel = getRerankModel(baseModelId);
  if (!rerankModel) {
    return Promise.reject(RerankTrainErrEnum.taskModelNotFound);
  }

  // Reject if there is already a pending/running task for the same team + base model
  const runningTask = await MongoRerankTrainTask.findOne({
    teamId,
    baseModelId,
    status: {
      $in: [RerankTrainTaskStatusEnum.pending, RerankTrainTaskStatusEnum.running]
    }
  }).lean();

  if (runningTask) {
    return Promise.reject(RerankTrainErrEnum.taskAlreadyRunning);
  }

  const baseModelEndpoint = buildModelEndpoint(rerankModel);

  addLog.info('Creating rerank train task', {
    baseModelId,
    baseModelEndpoint
  });

  const [{ _id }] = await MongoRerankTrainTask.create([
    {
      trainsetId: trainsetId || undefined,
      evalDatasetId: evalDatasetId || undefined,
      datasetIds: datasetIds?.length ? datasetIds : undefined,
      newModelName: newModelName || undefined,
      teamId,
      tmbId,
      name: name || `Rerank Training - ${new Date().toLocaleDateString()}`,
      baseModelId,
      baseModelEndpoint,
      status: RerankTrainTaskStatusEnum.pending,
      checkpoint: {
        stage: null,
        data: {},
        stageEndTime: {}
      }
    }
  ]);

  addLog.info('Created rerank train task', {
    baseModelId,
    trainsetId,
    taskId: String(_id)
  });

  return String(_id);
}

/** Update task status */
export async function updateTaskStatus(
  taskId: string,
  status: `${RerankTrainTaskStatusEnum}`
): Promise<void> {
  const updateData: {
    status: `${RerankTrainTaskStatusEnum}`;
    updateTime: Date;
    finishTime?: Date;
  } = {
    status,
    updateTime: new Date()
  };

  if (
    status === RerankTrainTaskStatusEnum.completed ||
    status === RerankTrainTaskStatusEnum.cancelled
  ) {
    updateData.finishTime = new Date();
  }

  await MongoRerankTrainTask.updateOne({ _id: taskId }, updateData);

  addLog.info('Updated task status', { taskId, status });
}

/** Update checkpoint stage and record completion time */
export async function updateCheckpointStage(
  taskId: string,
  stage: `${RerankTaskCheckpointStageEnum}`
): Promise<void> {
  await MongoRerankTrainTask.updateOne(
    { _id: taskId },
    {
      'checkpoint.stage': stage,
      [`checkpoint.stageEndTime.${stage}`]: new Date(),
      updateTime: new Date()
    }
  );

  addLog.info('Updated checkpoint stage completion', { taskId, stage });
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
export async function updateCheckpointData(
  taskId: string,
  stage:
    | 'generate_trainset'
    | 'generate_evaldataset'
    | 'eval_basemodel'
    | 'finetuning'
    | 'registering'
    | 'eval_tunedmodel'
    | 'applying',
  data: Record<string, unknown>,
  merge: boolean = false
): Promise<void> {
  if (merge) {
    const updateFields: Record<string, unknown> = { updateTime: new Date() };
    for (const [key, value] of Object.entries(data)) {
      updateFields[`checkpoint.data.${stage}.${key}`] = value;
    }
    await MongoRerankTrainTask.updateOne({ _id: taskId }, updateFields);
  } else {
    await MongoRerankTrainTask.updateOne(
      { _id: taskId },
      {
        [`checkpoint.data.${stage}`]: data,
        updateTime: new Date()
      }
    );
  }

  addLog.info('Updated checkpoint data', { taskId, stage, merge, keys: Object.keys(data) });
}

/** Get rerank training task by ID */
export async function getRerankTrainTask(
  taskId: string
): Promise<RerankTrainTaskSchemaType | null> {
  return MongoRerankTrainTask.findById(taskId).lean();
}

/**
 * Delete rerank training task with cascading deletion
 *
 * Cascades deletion to: evaluation datasets, evaluation data, task record, temp files.
 * Note: File cleanup executes asynchronously outside transaction to avoid blocking DB operations.
 * Note: No longer cascades to App versions (applying stage no longer creates app versions).
 *
 * @param taskId - Task ID to delete
 * @param session - Optional MongoDB session for transaction
 * @throws {Error} When task not found
 */
export async function deleteRerankTrainTask(
  taskId: string,
  session?: ClientSession
): Promise<void> {
  const task = await MongoRerankTrainTask.findById(taskId, null, { session }).lean();
  if (!task) {
    throw new Error('Task not found');
  }

  const tempFilePath = task.result?.trainDatasetFilePath;

  // Delete associated tuned model when deleting task
  const tunedModelId = task.checkpoint?.data?.registering?.tunedModelId;
  const sftTaskId = task.checkpoint?.data?.finetuning?.sftTaskId;
  if (tunedModelId) {
    addLog.info('Deleting tuned model associated with task', {
      taskId,
      tunedModelId,
      sftTaskId
    });

    try {
      await deleteRerankModelConfig(tunedModelId, sftTaskId);
      addLog.info('Successfully deleted tuned model', {
        taskId,
        tunedModelId,
        sftTaskId
      });
    } catch (error) {
      addLog.warn('Failed to delete tuned model, continuing with task deletion', {
        taskId,
        tunedModelId,
        sftTaskId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const evalCollections = await MongoEvalDatasetCollection.find(
    {
      'metadata.taskId': taskId
    },
    null,
    { session }
  ).lean();

  if (evalCollections.length > 0) {
    const collectionIds = evalCollections.map((col) => col._id);

    const deletedDataResult = await MongoEvalDatasetData.deleteMany(
      {
        evalDatasetCollectionId: { $in: collectionIds }
      },
      { session }
    );

    addLog.info('Deleted eval dataset data for task', {
      taskId,
      deletedCount: deletedDataResult.deletedCount
    });

    const deletedCollectionResult = await MongoEvalDatasetCollection.deleteMany(
      {
        _id: { $in: collectionIds }
      },
      { session }
    );

    addLog.info('Deleted eval dataset collections for task', {
      taskId,
      deletedCount: deletedCollectionResult.deletedCount
    });
  }

  await MongoRerankTrainTask.deleteOne({ _id: taskId }, { session });

  addLog.info('Deleted rerank train task', { taskId });

  if (tempFilePath) {
    setImmediate(() => {
      cleanupTempFiles(tempFilePath).catch((error) => {
        addLog.warn('Failed to cleanup temp files after task deletion', {
          taskId,
          tempFilePath,
          error: (error as Error).message
        });
      });
    });
  }
}

/** Cancel rerank training task */
export async function cancelRerankTrainTask(taskId: string): Promise<void> {
  const task = await MongoRerankTrainTask.findById(taskId).lean();
  if (!task) {
    throw new Error('Task not found');
  }

  if (
    task.status === RerankTrainTaskStatusEnum.completed ||
    task.status === RerankTrainTaskStatusEnum.failed ||
    task.status === RerankTrainTaskStatusEnum.cancelled
  ) {
    throw new Error('Cannot cancel a task that is already finished');
  }

  await updateTaskStatus(taskId, RerankTrainTaskStatusEnum.cancelled);

  addLog.info('Cancelled rerank train task', { taskId });
}

/**
 * Clean up temporary files related to training task
 *
 * @param filePath - Optional temp file path to delete
 * @param taskId - Optional task ID to generate file pattern for cleanup
 */
export async function cleanupTempFiles(filePath?: string, taskId?: string): Promise<void> {
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
      const trainDataDir = getRerankTrainDataDir();
      const files = await fs.readdir(trainDataDir);
      const tempFilePattern = new RegExp(`^rerank_train_${taskId}_\\d+\\.jsonl$`);

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
export async function resolveTasksByTunedModelId(
  tunedModelId: string,
  teamId: string
): Promise<RerankTrainTaskSchemaType[]> {
  const result: RerankTrainTaskSchemaType[] = [];
  const visited = new Set<string>();
  let currentId = tunedModelId;
  const MAX_DEPTH = 100;

  while (result.length < MAX_DEPTH) {
    if (visited.has(currentId)) {
      addLog.warn('Cycle detected in task chain traversal', { tunedModelId, currentId, teamId });
      break;
    }
    visited.add(currentId);

    const task = await MongoRerankTrainTask.findOne({
      teamId,
      'checkpoint.data.registering.tunedModelId': currentId
    }).lean();

    if (!task) break;

    result.push(task as unknown as RerankTrainTaskSchemaType);
    currentId = task.baseModelId;
  }

  if (result.length === MAX_DEPTH) {
    addLog.warn('Max depth reached in task chain traversal', {
      tunedModelId,
      teamId,
      resultCount: result.length
    });
  }

  return result;
}
