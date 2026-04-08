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

/**
 * Create embedding training task (decoupled from App)
 *
 * Key logic:
 * 1. Accepts baseModelId directly (no App workflow extraction)
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
}): Promise<string> {
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
    return Promise.reject(EmbeddingTrainErrEnum.taskBaseModelDisabled);
  }

  const embeddingModel = getEmbeddingModel(baseModelId);
  if (!embeddingModel) {
    return Promise.reject(EmbeddingTrainErrEnum.taskModelNotFound);
  }

  // Reject if there is already a pending/running task for the same team + base model
  const runningTask = await MongoEmbeddingTrainTask.findOne({
    teamId,
    baseModelId,
    status: {
      $in: [EmbeddingTrainTaskStatusEnum.pending, EmbeddingTrainTaskStatusEnum.running]
    }
  }).lean();

  if (runningTask) {
    return Promise.reject(EmbeddingTrainErrEnum.taskAlreadyRunning);
  }

  const baseModelEndpoint = buildModelEndpoint(embeddingModel);

  addLog.info('Creating embedding train task', {
    baseModelId,
    baseModelEndpoint
  });

  const [{ _id }] = await MongoEmbeddingTrainTask.create([
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
    taskId: String(_id)
  });

  return String(_id);
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
    status === EmbeddingTrainTaskStatusEnum.cancelled
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

/** Delete embedding training task */
export async function deleteEmbeddingTrainTask(
  taskId: string,
  session?: ClientSession
): Promise<void> {
  const task = await MongoEmbeddingTrainTask.findById(taskId, null, { session }).lean();
  if (!task) {
    return Promise.reject(EmbeddingTrainErrEnum.taskNotExist);
  }

  // Delete task record and associated resources can be added as needed
  await MongoEmbeddingTrainTask.deleteOne({ _id: taskId }, { session });

  addLog.info('Deleted embedding train task', { taskId });
}

/** Cancel embedding training task */
export async function cancelEmbeddingTrainTask(taskId: string): Promise<void> {
  const task = await MongoEmbeddingTrainTask.findById(taskId).lean();
  if (!task) {
    return Promise.reject(EmbeddingTrainErrEnum.taskNotExist);
  }

  if (
    task.status !== EmbeddingTrainTaskStatusEnum.pending &&
    task.status !== EmbeddingTrainTaskStatusEnum.running
  ) {
    return Promise.reject(EmbeddingTrainErrEnum.taskCannotCancel);
  }

  await MongoEmbeddingTrainTask.updateOne(
    { _id: taskId },
    {
      status: EmbeddingTrainTaskStatusEnum.cancelled,
      updateTime: new Date(),
      finishTime: new Date()
    }
  );

  addLog.info('Cancelled embedding train task', { taskId });
}
