import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { MongoRerankTrainTask } from './schema';
import { MongoApp } from '../../../app/schema';
import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import type { RerankTaskCheckpointStageEnum } from '@fastgpt/global/core/train/rerank/constants';
import { RerankTrainTaskStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { addLog } from '../../../../common/system/log';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getDefaultRerankModel, getRerankModel } from '../../../ai/model';
import type { ClientSession } from '../../../../common/mongo';
import { MongoEvalDatasetCollection } from '../../../evaluation/dataset/evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from '../../../evaluation/dataset/evalDatasetDataSchema';
import { extractModelFromApp, buildModelEndpoint } from '../utils';

/**
 * Create rerank training task (only creates record, does not start execution)
 *
 * Key logic:
 * 1. Extracts current rerank model config from app workflow
 * 2. Parses baseModelEndpoint information
 * 3. Stores baseModelConfigId and baseModelEndpoint at task root level (alongside appId, teamId)
 * 4. Associates task with specific trainset via trainsetId
 *
 * @param params - Task creation parameters
 * @param params.appId - Application ID
 * @param params.trainsetId - Trainset ID to use for training
 * @param params.teamId - Team ID
 * @param params.tmbId - Team member ID
 * @param params.name - Optional task name
 * @returns Task ID
 * @throws {Error} When app not found or rerank model not found
 */
export async function createRerankTrainTask(params: {
  appId: string;
  trainsetId: string;
  teamId: string;
  tmbId: string;
  name?: string;
}): Promise<string> {
  const { appId, trainsetId, teamId, tmbId, name } = params;

  const app = await MongoApp.findById(appId).lean();
  if (!app) {
    throw new Error('Application not found');
  }

  const baseModelConfigId = extractModelFromApp(
    app,
    FlowNodeTypeEnum.datasetSearchNode,
    NodeInputKeyEnum.datasetSearchRerankModel,
    getDefaultRerankModel
  );

  const rerankModel = getRerankModel(baseModelConfigId);
  if (!rerankModel) {
    throw new Error(`Rerank model not found: ${baseModelConfigId}`);
  }

  const baseModelEndpoint = buildModelEndpoint(rerankModel);

  addLog.info('Extracted base model config from App workflow', {
    appId,
    baseModelConfigId,
    baseModelEndpoint
  });

  const [{ _id }] = await MongoRerankTrainTask.create([
    {
      appId,
      trainsetId,
      teamId,
      tmbId,
      name: name || `Rerank Training - ${new Date().toLocaleDateString()}`,
      baseModelConfigId,
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
    appId,
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
 * 2. Partial merge (merge=true): Updates only specific fields within stage (used for evaluation's 3 substeps)
 *
 * @param taskId - Task ID
 * @param stage - Checkpoint stage name
 * @param data - Data to update
 * @param merge - Whether to merge with existing data (default: false)
 *
 * @example Full replacement
 * await updateCheckpointData(taskId, 'preparing', {
 *   trainDatasetId: '...',
 *   trainDatasetFilePath: '...'
 * });
 *
 * @example Partial merge (evaluation stage)
 * await updateCheckpointData(taskId, 'evaluating', {
 *   evalDatasetId: '...'
 * }, true);
 */
export async function updateCheckpointData(
  taskId: string,
  stage: 'preparing' | 'finetuning' | 'registering' | 'evaluating' | 'applying',
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
      try {
        await fs.unlink(filePath);
        addLog.info('Cleaned up temp file', { filePath });
      } catch (error) {
        addLog.warn('Failed to delete temp file', {
          filePath,
          error: (error as Error).message
        });
      }
    } else if (taskId) {
      const tempDir = os.tmpdir();
      const files = await fs.readdir(tempDir);

      const tempFilePattern = new RegExp(`^rerank_train_${taskId}_\\d+\\.jsonl$`);

      for (const file of files) {
        if (tempFilePattern.test(file)) {
          const filePath = path.join(tempDir, file);
          try {
            await fs.unlink(filePath);
            addLog.info('Cleaned up temp file', { taskId, filePath });
          } catch (error) {
            addLog.warn('Failed to delete temp file', {
              taskId,
              filePath,
              error: (error as Error).message
            });
          }
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
