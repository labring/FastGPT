import * as fs from 'fs/promises';
import type { EmbeddingTrainTaskSchemaType } from '@fastgpt/global/core/train/embedding/type';
import {
  EmbeddingTrainTaskStatusEnum,
  EmbeddingTaskCheckpointStageEnum
} from '@fastgpt/global/core/train/embedding/constants';
import { createSFTTask, querySFTTaskStatus, SFTTaskStatus } from '../../external';
import { addLog } from '../../../../../common/system/log';
import { getEmbeddingTrainTask } from '../controller';
import { trainEnv } from '../../../common/env';
import { createEmbeddingEnhancedError } from '../../utils';
import {
  EmbeddingTrainErrEnum,
  EmbeddingTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import { TrainTaskUnrecoverableError, TrainTaskRetriableError } from '../../../common/errors';
import { getTrainTaskAbortSignal } from '../../../common/task-abort-signal';

const TASK_ABORT_SIGNAL_CHECK_INTERVAL = 10 * 1000;

/**
 * Stage 4: Model Finetuning
 *
 * Calls SFT Bridge platform with taskType='embedding', uploads JSONL dataset.
 * SFT Bridge automatically completes finetuning and deploys to inference service.
 *
 * Key difference from rerank: taskType is 'embedding' instead of 'rerank'.
 *
 * @param task - Embedding training task data
 * @returns SFT task ID and tuned model endpoint
 * @throws {TrainTaskUnrecoverableError} When dataset file or base model endpoint not found
 */
export async function runFinetuneStage(task: EmbeddingTrainTaskSchemaType): Promise<{
  sftTaskId: string;
  tunedModelEndpoint: {
    base_url: string;
    model: string;
    api_key: string;
  };
}> {
  addLog.info('Run finetune stage (embedding)', { taskId: String(task._id) });

  const checkpointData = task.checkpoint.data || {};
  if (!checkpointData.generate_trainset?.trainDatasetFilePath) {
    const enhancedError = createEmbeddingEnhancedError(
      EmbeddingTaskCheckpointStageEnum.finetuning,
      EmbeddingTrainErrEnum.embeddingFinetuneDataPathNotFound,
      EmbeddingTrainSuggestionEnum.embeddingFinetuneDataPathNotFound
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  if (!task.baseModelEndpoint.model) {
    const enhancedError = createEmbeddingEnhancedError(
      EmbeddingTaskCheckpointStageEnum.finetuning,
      EmbeddingTrainErrEnum.embeddingFinetuneModelConfigInvalid,
      EmbeddingTrainSuggestionEnum.embeddingFinetuneModelConfigInvalid
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  let datasetFile: Buffer;
  try {
    datasetFile = await fs.readFile(checkpointData.generate_trainset.trainDatasetFilePath);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const enhancedError = createEmbeddingEnhancedError(
      EmbeddingTaskCheckpointStageEnum.finetuning,
      EmbeddingTrainErrEnum.embeddingFinetuneDataFileNotFound,
      EmbeddingTrainSuggestionEnum.embeddingFinetuneDataFileNotFound,
      errorMsg
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  await ensureTaskActiveBeforeSFTCreation({ taskId: String(task._id) });
  await ensureTaskNotAborted({
    taskId: String(task._id),
    sftTaskId: undefined
  });

  let sftTaskId: string;
  try {
    const createResponse = await createSFTTask({
      datasetFile,
      taskType: 'embed', // Key difference from rerank (SFT Bridge uses 'embed' for embedding)
      trainMethod: task.trainMethod || 'lora',
      parameters: {
        learning_rate: trainEnv.SFT_BRIDGE_LEARNING_RATE,
        epochs: 3,
        batch_size: 32
      }
    });

    sftTaskId = createResponse.task_id;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const enhancedError = createEmbeddingEnhancedError(
      EmbeddingTaskCheckpointStageEnum.finetuning,
      EmbeddingTrainErrEnum.embeddingFinetuneSftBridgeCreateFailed,
      EmbeddingTrainSuggestionEnum.embeddingFinetuneSftBridgeCreateFailed,
      errorMsg
    );
    throw new TrainTaskRetriableError(enhancedError);
  }

  addLog.info('Created SFT task for embedding', {
    taskId: String(task._id),
    sftTaskId
  });

  let completed = false;
  let endpoint:
    | {
        base_url: string;
        model: string;
        api_key: string;
      }
    | undefined = undefined;

  const maxPolls = trainEnv.SFT_BRIDGE_MAX_POLLS;
  const pollInterval = trainEnv.SFT_BRIDGE_POLL_INTERVAL;

  addLog.info('SFT task polling configuration (embedding)', {
    taskId: String(task._id),
    maxPolls,
    pollInterval,
    maxDuration: `${(maxPolls * pollInterval) / 1000 / 60} minutes`
  });

  let pollCount = 0;

  while (!completed && pollCount < maxPolls) {
    await waitForNextSFTPoll({
      taskId: String(task._id),
      sftTaskId,
      pollInterval
    });

    const statusResponse = await querySFTTaskStatus({
      taskId: sftTaskId
    });

    addLog.info('SFT task status (embedding)', {
      taskId: String(task._id),
      sftTaskId,
      status: statusResponse.status,
      progress: statusResponse.progress
    });

    if (statusResponse.status === SFTTaskStatus.completed) {
      completed = true;
      endpoint = statusResponse.endpoint;

      if (!endpoint) {
        const enhancedError = createEmbeddingEnhancedError(
          EmbeddingTaskCheckpointStageEnum.finetuning,
          EmbeddingTrainErrEnum.embeddingFinetuneDeploymentFailed,
          EmbeddingTrainSuggestionEnum.embeddingFinetuneDeploymentFailed
        );
        throw new TrainTaskRetriableError(enhancedError);
      }
    } else if (statusResponse.status === SFTTaskStatus.failed) {
      const errorMsg = statusResponse.error;
      const enhancedError = createEmbeddingEnhancedError(
        EmbeddingTaskCheckpointStageEnum.finetuning,
        EmbeddingTrainErrEnum.embeddingFinetuneTrainingFailed,
        EmbeddingTrainSuggestionEnum.embeddingFinetuneTrainingFailed,
        errorMsg
      );
      throw new TrainTaskUnrecoverableError(enhancedError);
    }

    pollCount++;
  }

  if (!completed) {
    const timeoutDuration = `${(maxPolls * pollInterval) / 1000 / 60} minutes`;
    addLog.error('SFT task polling timeout (embedding)', {
      taskId: String(task._id),
      sftTaskId,
      maxPolls,
      pollInterval,
      timeoutDuration
    });
    const enhancedError = createEmbeddingEnhancedError(
      EmbeddingTaskCheckpointStageEnum.finetuning,
      EmbeddingTrainErrEnum.embeddingFinetuneTimeout,
      EmbeddingTrainSuggestionEnum.embeddingFinetuneTimeout
    );
    throw new TrainTaskRetriableError(enhancedError);
  }

  if (!endpoint) {
    const enhancedError = createEmbeddingEnhancedError(
      EmbeddingTaskCheckpointStageEnum.finetuning,
      EmbeddingTrainErrEnum.embeddingFinetuneDeploymentNoEndpoint,
      EmbeddingTrainSuggestionEnum.embeddingFinetuneDeploymentNoEndpoint
    );
    throw new TrainTaskRetriableError(enhancedError);
  }

  addLog.info('Embedding finetune stage completed (tuned model auto-deployed to serving)', {
    taskId: String(task._id),
    baseModelId: task.baseModelId,
    baseModelEndpoint: task.baseModelEndpoint,
    tunedModelEndpoint: endpoint
  });

  return {
    sftTaskId,
    tunedModelEndpoint: endpoint
  };
}

async function ensureTaskActiveBeforeSFTCreation({ taskId }: { taskId: string }) {
  const currentTask = await getEmbeddingTrainTask(taskId);
  if (!currentTask) {
    addLog.warn('SFT task creation skipped because task was deleted', { taskId });
    throwTaskDeletedError();
  }

  if (currentTask.status === EmbeddingTrainTaskStatusEnum.cancelled) {
    addLog.warn('SFT task creation skipped because task was cancelled', { taskId });
    throwTaskCancelledError();
  }
}

async function ensureTaskNotAborted({ taskId, sftTaskId }: { taskId: string; sftTaskId?: string }) {
  let abortReason: Awaited<ReturnType<typeof getTrainTaskAbortSignal>>;
  try {
    abortReason = await getTrainTaskAbortSignal({ type: 'embedding', taskId });
  } catch (error) {
    addLog.warn('Failed to check embedding train task abort signal', {
      taskId,
      sftTaskId,
      error: error instanceof Error ? error.message : String(error)
    });
    return;
  }

  if (abortReason === 'deleted') {
    addLog.warn('SFT task polling stopped because task was deleted', {
      taskId,
      sftTaskId
    });
    throwTaskDeletedError();
  }

  if (abortReason === 'cancelled') {
    addLog.warn('SFT task polling cancelled by user', {
      taskId,
      sftTaskId
    });
    throwTaskCancelledError();
  }
}

function throwTaskDeletedError(): never {
  const enhancedError = createEmbeddingEnhancedError(
    EmbeddingTaskCheckpointStageEnum.finetuning,
    EmbeddingTrainErrEnum.embeddingTaskNotExist,
    EmbeddingTrainSuggestionEnum.embeddingTaskNotExist
  );
  throw new TrainTaskUnrecoverableError(enhancedError);
}

function throwTaskCancelledError(): never {
  const enhancedError = createEmbeddingEnhancedError(
    EmbeddingTaskCheckpointStageEnum.finetuning,
    EmbeddingTrainErrEnum.embeddingFinetuneCancelled,
    EmbeddingTrainSuggestionEnum.embeddingFinetuneCancelled
  );
  throw new TrainTaskUnrecoverableError(enhancedError);
}

async function waitForNextSFTPoll({
  taskId,
  sftTaskId,
  pollInterval
}: {
  taskId: string;
  sftTaskId: string;
  pollInterval: number;
}) {
  await ensureTaskNotAborted({ taskId, sftTaskId });

  const checkInterval = Math.min(TASK_ABORT_SIGNAL_CHECK_INTERVAL, pollInterval);
  if (checkInterval <= 0) {
    return;
  }

  let waited = 0;
  while (waited < pollInterval) {
    const waitMs = Math.min(checkInterval, pollInterval - waited);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    waited += waitMs;

    await ensureTaskNotAborted({ taskId, sftTaskId });
  }
}
