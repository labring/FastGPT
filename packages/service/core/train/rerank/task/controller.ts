import * as fs from 'fs/promises';
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
import { MongoAppVersion } from '../../../app/version/schema';
import { extractModelFromApp, buildModelEndpoint } from '../utils';
import { deleteRerankModelConfig } from '../model/controller';
import { getRerankTrainDataDir } from '../constants';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { mongoSessionRun } from '../../../../common/mongo/sessionRun';

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
 * @throws {RerankTrainErrEnum} When app not found or rerank model not found
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
    return Promise.reject(RerankTrainErrEnum.taskAppNotFound);
  }

  const baseModelConfigId = extractModelFromApp(
    app,
    FlowNodeTypeEnum.datasetSearchNode,
    NodeInputKeyEnum.datasetSearchRerankModel,
    getDefaultRerankModel
  );

  const rerankModel = getRerankModel(baseModelConfigId);
  if (!rerankModel) {
    return Promise.reject(RerankTrainErrEnum.taskModelNotFound);
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

  // Optimization 1: Delete associated tuned model when deleting task
  const tunedModelConfigId = task.checkpoint?.data?.registering?.tunedModelConfigId;
  const sftTaskId = task.checkpoint?.data?.finetuning?.sftTaskId;
  if (tunedModelConfigId) {
    addLog.info('Deleting tuned model associated with task', {
      taskId,
      tunedModelConfigId,
      sftTaskId
    });

    try {
      await deleteRerankModelConfig(tunedModelConfigId, sftTaskId);
      addLog.info('Successfully deleted tuned model', {
        taskId,
        tunedModelConfigId,
        sftTaskId
      });
    } catch (error) {
      addLog.warn('Failed to delete tuned model, continuing with task deletion', {
        taskId,
        tunedModelConfigId,
        sftTaskId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Optimization 2: Delete associated app version and restore previous version
  const versionId = task.result?.versionId || task.checkpoint?.data?.applying?.versionId;
  if (versionId) {
    addLog.info('Deleting app version associated with task', {
      taskId,
      versionId,
      appId: String(task.appId)
    });

    try {
      // Check if this version is the latest published version
      const latestPublishedVersion = await MongoAppVersion.findOne(
        {
          appId: task.appId,
          isPublish: true
        },
        null,
        { session, sort: { time: -1 } }
      ).lean();

      const isLatestVersion =
        latestPublishedVersion && String(latestPublishedVersion._id) === versionId;

      // Delete the task's version
      const deleteResult = await MongoAppVersion.deleteOne({ _id: versionId }, { session });

      if (deleteResult.deletedCount === 0) {
        addLog.warn('No app version found to delete', { taskId, versionId });
      } else {
        addLog.info('Deleted app version', { taskId, versionId });

        // Only update app if the deleted version was the latest published version
        if (isLatestVersion) {
          // Find the new latest published version (after deletion)
          const newLatestVersion = await MongoAppVersion.findOne(
            {
              appId: task.appId,
              isPublish: true
            },
            null,
            { session, sort: { time: -1 } }
          ).lean();

          if (newLatestVersion) {
            // Update app to reference the new latest published version
            await MongoApp.findByIdAndUpdate(
              task.appId,
              {
                modules: newLatestVersion.nodes || [],
                edges: newLatestVersion.edges || [],
                chatConfig: newLatestVersion.chatConfig || {},
                'pluginData.nodeVersion': String(newLatestVersion._id),
                updateTime: new Date()
              },
              { session }
            );

            addLog.info('Restored previous app version as current published version', {
              taskId,
              newLatestVersionId: String(newLatestVersion._id),
              newLatestVersionName: newLatestVersion.versionName
            });
          } else {
            // No published version left, clear the version reference
            await MongoApp.findByIdAndUpdate(
              task.appId,
              {
                'pluginData.nodeVersion': undefined,
                updateTime: new Date()
              },
              { session }
            );

            addLog.warn('No published version remaining after deletion', {
              taskId,
              appId: String(task.appId)
            });
          }
        } else {
          addLog.info('Deleted version was not the latest, app state unchanged', {
            taskId,
            versionId,
            latestVersionId: latestPublishedVersion ? String(latestPublishedVersion._id) : 'none'
          });
        }
      }
    } catch (error) {
      addLog.warn(
        'Failed to delete app version or restore previous version, continuing with task deletion',
        {
          taskId,
          versionId,
          error: error instanceof Error ? error.message : String(error)
        }
      );
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

/**
 * Delete multiple rerank training tasks for an app with optimized version rollback
 *
 * This function deletes all tasks for a given app and performs smart version rollback:
 * 1. Collects all tuned models and versions created by training tasks
 * 2. Deletes tasks and their associated resources within a MongoDB transaction
 * 3. Batch deletes all training-created versions
 * 4. Rolls back app to the last version before any training tasks
 *
 * IMPORTANT: All database operations are protected by MongoDB transaction to ensure atomicity
 *
 * @param appId - Application ID
 * @returns Deletion results with counts and errors
 */
export async function deleteAllRerankTrainTasksByApp(appId: string): Promise<{
  deletedCount: number;
  skippedCount: number;
  errors: Array<{ taskId: string; error: string }>;
}> {
  addLog.info('Starting optimized batch deletion for app', { appId });

  // 1. Fetch all tasks for this app (outside transaction for read-only query)
  const tasks = await MongoRerankTrainTask.find({ appId }).lean();

  if (tasks.length === 0) {
    addLog.info('No tasks found for app', { appId });
    return { deletedCount: 0, skippedCount: 0, errors: [] };
  }

  addLog.info('Found tasks to process', { appId, taskCount: tasks.length });

  // 2. Separate tasks into deletable and non-deletable (running/pending)
  const deletableTasks = tasks.filter(
    (task) =>
      task.status !== RerankTrainTaskStatusEnum.pending &&
      task.status !== RerankTrainTaskStatusEnum.running
  );
  const nonDeletableTasks = tasks.filter(
    (task) =>
      task.status === RerankTrainTaskStatusEnum.pending ||
      task.status === RerankTrainTaskStatusEnum.running
  );

  addLog.info('Task categorization', {
    appId,
    deletableCount: deletableTasks.length,
    nonDeletableCount: nonDeletableTasks.length
  });

  if (deletableTasks.length === 0) {
    // All tasks are running/pending, no deletion needed
    const errors = nonDeletableTasks.map((task) => ({
      taskId: String(task._id),
      error: `Task is ${task.status}, cannot delete running/pending tasks`
    }));
    return { deletedCount: 0, skippedCount: nonDeletableTasks.length, errors };
  }

  // 3. Collect all resources to clean up
  const tunedModels: Array<{ modelId: string; sftTaskId?: string }> = [];
  const versionIds: string[] = [];
  const tempFilePaths: string[] = [];
  const taskIds: string[] = [];

  for (const task of deletableTasks) {
    taskIds.push(String(task._id));

    // Collect tuned model info with paired relationship
    const tunedModelConfigId = task.checkpoint?.data?.registering?.tunedModelConfigId;
    const sftTaskId = task.checkpoint?.data?.finetuning?.sftTaskId;
    if (tunedModelConfigId) {
      tunedModels.push({ modelId: tunedModelConfigId, sftTaskId });
    }

    // Collect version info
    const versionId = task.result?.versionId || task.checkpoint?.data?.applying?.versionId;
    if (versionId) {
      versionIds.push(versionId);
    }

    // Collect temp file paths
    const tempFilePath = task.result?.trainDatasetFilePath;
    if (tempFilePath) {
      tempFilePaths.push(tempFilePath);
    }
  }

  addLog.info('Collected resources to clean up', {
    appId,
    tunedModels: tunedModels.length,
    versions: versionIds.length,
    tempFiles: tempFilePaths.length
  });

  // 4. Delete tuned models BEFORE transaction (external service calls)
  // Model deletion involves external services (SFT Bridge, AI Proxy) which cannot be part of DB transaction
  const modelDeletionErrors: Array<{ taskId: string; error: string }> = [];

  if (tunedModels.length > 0) {
    addLog.info('Deleting tuned models (outside transaction)', {
      appId,
      modelCount: tunedModels.length
    });

    const modelDeletionResults = await Promise.allSettled(
      tunedModels.map((model) =>
        deleteRerankModelConfig(model.modelId, model.sftTaskId).catch((error) => {
          const errorMsg = error instanceof Error ? error.message : String(error);
          addLog.warn('Failed to delete tuned model', {
            modelId: model.modelId,
            sftTaskId: model.sftTaskId,
            error: errorMsg
          });
          throw new Error(errorMsg);
        })
      )
    );

    modelDeletionResults.forEach((result, idx) => {
      if (result.status === 'rejected') {
        modelDeletionErrors.push({
          taskId: 'model_cleanup',
          error: `Failed to delete model ${tunedModels[idx].modelId}: ${result.reason}`
        });
      }
    });

    addLog.info('Model deletion completed', {
      appId,
      successful: modelDeletionResults.filter((r) => r.status === 'fulfilled').length,
      failed: modelDeletionErrors.length
    });
  }

  // 5. Execute all database operations within a transaction
  await mongoSessionRun(async (session: ClientSession) => {
    addLog.info('Starting transaction for database operations', { appId });

    // Find evaluation collections
    const evalCollectionIds: string[] = [];
    if (taskIds.length > 0) {
      const evalCollections = await MongoEvalDatasetCollection.find(
        { 'metadata.taskId': { $in: taskIds } },
        null,
        { session }
      ).lean();
      evalCollectionIds.push(...evalCollections.map((col) => String(col._id)));

      addLog.info('Found evaluation collections', {
        appId,
        collectionCount: evalCollectionIds.length
      });
    }

    // Delete evaluation data
    if (evalCollectionIds.length > 0) {
      const deletedDataResult = await MongoEvalDatasetData.deleteMany(
        { evalDatasetCollectionId: { $in: evalCollectionIds } },
        { session }
      );

      addLog.info('Deleted eval dataset data', {
        appId,
        deletedCount: deletedDataResult.deletedCount
      });

      // Delete evaluation collections
      const deletedCollectionResult = await MongoEvalDatasetCollection.deleteMany(
        { _id: { $in: evalCollectionIds } },
        { session }
      );

      addLog.info('Deleted eval dataset collections', {
        appId,
        deletedCount: deletedCollectionResult.deletedCount
      });
    }

    // Delete tasks from database
    const taskDeletionResult = await MongoRerankTrainTask.deleteMany(
      { _id: { $in: taskIds } },
      { session }
    );

    addLog.info('Deleted tasks from database', {
      appId,
      deletedCount: taskDeletionResult.deletedCount
    });

    // Batch delete all training-created versions
    if (versionIds.length > 0) {
      // IMPORTANT: Find pre-training version BEFORE deleting training versions
      // This ensures we have the correct rollback target
      const preTrainingVersion = await MongoAppVersion.findOne(
        {
          appId,
          isPublish: true,
          _id: { $nin: versionIds }
        },
        null,
        { session }
      )
        .sort({ time: -1 })
        .lean();

      // Now delete training-created versions
      const versionDeletionResult = await MongoAppVersion.deleteMany(
        { _id: { $in: versionIds } },
        { session }
      );

      addLog.info('Deleted training-created versions', {
        appId,
        deletedCount: versionDeletionResult.deletedCount
      });

      // Smart version rollback: Restore pre-training version
      if (preTrainingVersion) {
        await MongoApp.findByIdAndUpdate(
          appId,
          {
            modules: preTrainingVersion.nodes || [],
            edges: preTrainingVersion.edges || [],
            chatConfig: preTrainingVersion.chatConfig || {},
            'pluginData.nodeVersion': String(preTrainingVersion._id),
            updateTime: new Date()
          },
          { session }
        );

        addLog.info('Rolled back app to pre-training version', {
          appId,
          versionId: String(preTrainingVersion._id),
          versionName: preTrainingVersion.versionName
        });
      } else {
        // No pre-training version found, clear version reference
        await MongoApp.findByIdAndUpdate(
          appId,
          {
            'pluginData.nodeVersion': undefined,
            updateTime: new Date()
          },
          { session }
        );

        addLog.warn('No pre-training version found, cleared version reference', { appId });
      }
    }

    addLog.info('Transaction completed successfully', { appId });
  });

  // 6. Cleanup temp files asynchronously (outside transaction)
  if (tempFilePaths.length > 0) {
    setImmediate(() => {
      Promise.all(
        tempFilePaths.map((filePath) =>
          cleanupTempFiles(filePath).catch((error) => {
            addLog.warn('Failed to cleanup temp file', {
              filePath,
              error: error instanceof Error ? error.message : String(error)
            });
          })
        )
      );
    });
  }

  // 7. Collect all errors
  const errors: Array<{ taskId: string; error: string }> = [
    ...modelDeletionErrors,
    ...nonDeletableTasks.map((task) => ({
      taskId: String(task._id),
      error: `Task is ${task.status}, cannot delete running/pending tasks`
    }))
  ];

  addLog.info('Batch deletion completed', {
    appId,
    totalTasks: tasks.length,
    deletedCount: deletableTasks.length,
    skippedCount: nonDeletableTasks.length,
    errorCount: errors.length
  });

  return {
    deletedCount: deletableTasks.length,
    skippedCount: nonDeletableTasks.length,
    errors
  };
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
