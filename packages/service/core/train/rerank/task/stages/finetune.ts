import * as fs from 'fs/promises';
import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import {
  RerankTrainTaskStatusEnum,
  RerankTaskCheckpointStageEnum
} from '@fastgpt/global/core/train/rerank/constants';
import { createSFTTask, querySFTTaskStatus, SFTTaskStatus } from '../../external';
import { addLog } from '../../../../../common/system/log';
import { getRerankTrainTask, updateRerankCheckpointData } from '../controller';
import { trainEnv } from '../../../common/env';
import { createRerankEnhancedError } from '../../utils';
import {
  RerankTrainErrEnum,
  RerankTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import { TrainTaskUnrecoverableError, TrainTaskRetriableError } from '../../../common/errors';
import { getTrainTaskAbortSignal } from '../../../common/task-abort-signal';

const TASK_ABORT_SIGNAL_CHECK_INTERVAL = 10 * 1000;

const isSFTBridgeQueueFullError = (errorMsg: string) =>
  errorMsg.toLowerCase().includes('too many concurrent tasks');

/**
 * Stage 2: Model Finetuning
 *
 * Calls SFT Bridge platform, uploads JSONL dataset.
 * SFT Bridge automatically completes finetuning and deploys to inference service.
 *
 * @param task - Training tadsk data
 * @returns SFT task ID and tuned model endpoint
 * @throws {UnrecoverableError} When dataset file or base model endpoint not found
 */
export async function runFinetuneStage(task: RerankTrainTaskSchemaType): Promise<{
  sftTaskId: string;
  tunedModelEndpoint: {
    base_url: string;
    model: string;
    api_key: string;
  };
}> {
  addLog.info('Run finetune stage', { taskId: String(task._id) });

  const checkpointData = task.checkpoint.data || {};
  let sftTaskId = checkpointData.finetuning?.sftTaskId;

  if (sftTaskId) {
    addLog.info('Reuse existing SFT task from checkpoint', {
      taskId: String(task._id),
      sftTaskId
    });
  } else {
    if (!task.baseModelEndpoint.model) {
      const enhancedError = createRerankEnhancedError(
        RerankTaskCheckpointStageEnum.finetuning,
        RerankTrainErrEnum.rerankFinetuneModelConfigInvalid,
        RerankTrainSuggestionEnum.rerankFinetuneModelConfigInvalid
      );
      throw new TrainTaskUnrecoverableError(enhancedError);
    }

    if (!checkpointData.generate_trainset?.trainDatasetFilePath) {
      const enhancedError = createRerankEnhancedError(
        RerankTaskCheckpointStageEnum.finetuning,
        RerankTrainErrEnum.rerankFinetuneDataPathNotFound,
        RerankTrainSuggestionEnum.rerankFinetuneDataPathNotFound
      );
      throw new TrainTaskUnrecoverableError(enhancedError);
    }

    let datasetFile: Buffer;
    try {
      datasetFile = await fs.readFile(checkpointData.generate_trainset.trainDatasetFilePath);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const enhancedError = createRerankEnhancedError(
        RerankTaskCheckpointStageEnum.finetuning,
        RerankTrainErrEnum.rerankFinetuneDataFileNotFound,
        RerankTrainSuggestionEnum.rerankFinetuneDataFileNotFound,
        errorMsg
      );
      throw new TrainTaskUnrecoverableError(enhancedError);
    }

    await ensureTaskActiveBeforeSFTCreation({ taskId: String(task._id) });
    await ensureTaskNotAborted({
      taskId: String(task._id),
      sftTaskId: undefined
    });

    if (!checkpointData.generate_evaldataset?.evalDatasetFilePath) {
      const enhancedError = createRerankEnhancedError(
        RerankTaskCheckpointStageEnum.finetuning,
        RerankTrainErrEnum.rerankFinetuneDataPathNotFound,
        RerankTrainSuggestionEnum.rerankFinetuneDataPathNotFound
      );
      throw new TrainTaskUnrecoverableError(enhancedError);
    }

    let evalDatasetFile: Buffer;
    try {
      evalDatasetFile = await fs.readFile(checkpointData.generate_evaldataset.evalDatasetFilePath);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const enhancedError = createRerankEnhancedError(
        RerankTaskCheckpointStageEnum.finetuning,
        RerankTrainErrEnum.rerankFinetuneDataFileNotFound,
        RerankTrainSuggestionEnum.rerankFinetuneDataFileNotFound,
        errorMsg
      );
      throw new TrainTaskUnrecoverableError(enhancedError);
    }

    let createResponse: Awaited<ReturnType<typeof createSFTTask>>;
    try {
      createResponse = await createSFTTask({
        datasetFile,
        taskType: 'rerank',
        trainMethod: task.trainMethod || 'lora',
        parameters: {
          learning_rate: trainEnv.SFT_BRIDGE_LEARNING_RATE,
          epochs: 3,
          batch_size: 32
        },
        evalDatasetFile
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorType = isSFTBridgeQueueFullError(errorMsg)
        ? RerankTrainErrEnum.rerankFinetuneQueueFull
        : RerankTrainErrEnum.rerankFinetuneSftBridgeCreateFailed;
      const suggestionType = isSFTBridgeQueueFullError(errorMsg)
        ? RerankTrainSuggestionEnum.rerankFinetuneQueueFull
        : RerankTrainSuggestionEnum.rerankFinetuneSftBridgeCreateFailed;
      const enhancedError = createRerankEnhancedError(
        RerankTaskCheckpointStageEnum.finetuning,
        errorType,
        suggestionType,
        errorMsg
      );
      throw new TrainTaskRetriableError(enhancedError);
    }

    sftTaskId = createResponse.task_id;
    await updateRerankCheckpointData(
      String(task._id),
      RerankTaskCheckpointStageEnum.finetuning,
      { sftTaskId },
      true
    );

    addLog.info('Created SFT task', {
      taskId: String(task._id),
      sftTaskId
    });
  }

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

  addLog.info('SFT task polling configuration', {
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

    addLog.info('SFT task status', {
      taskId: String(task._id),
      sftTaskId,
      status: statusResponse.status,
      progress: statusResponse.progress
    });

    if (statusResponse.status === SFTTaskStatus.completed) {
      completed = true;
      endpoint = statusResponse.endpoint;

      if (!endpoint) {
        const enhancedError = createRerankEnhancedError(
          RerankTaskCheckpointStageEnum.finetuning,
          RerankTrainErrEnum.rerankFinetuneDeploymentFailed,
          RerankTrainSuggestionEnum.rerankFinetuneDeploymentFailed
        );
        throw new TrainTaskRetriableError(enhancedError);
      }
    } else if (statusResponse.status === SFTTaskStatus.failed) {
      const errorMsg = statusResponse.error;
      const enhancedError = createRerankEnhancedError(
        RerankTaskCheckpointStageEnum.finetuning,
        RerankTrainErrEnum.rerankFinetuneTrainingFailed,
        RerankTrainSuggestionEnum.rerankFinetuneTrainingFailed,
        errorMsg
      );
      throw new TrainTaskUnrecoverableError(enhancedError);
    }

    pollCount++;
  }

  if (!completed) {
    const timeoutDuration = `${(maxPolls * pollInterval) / 1000 / 60} minutes`;
    addLog.error('SFT task polling timeout', {
      taskId: String(task._id),
      sftTaskId,
      maxPolls,
      pollInterval,
      timeoutDuration
    });
    const enhancedError = createRerankEnhancedError(
      RerankTaskCheckpointStageEnum.finetuning,
      RerankTrainErrEnum.rerankFinetuneTimeout,
      RerankTrainSuggestionEnum.rerankFinetuneTimeout
    );
    throw new TrainTaskRetriableError(enhancedError);
  }

  if (!endpoint) {
    const enhancedError = createRerankEnhancedError(
      RerankTaskCheckpointStageEnum.finetuning,
      RerankTrainErrEnum.rerankFinetuneDeploymentNoEndpoint,
      RerankTrainSuggestionEnum.rerankFinetuneDeploymentNoEndpoint
    );
    throw new TrainTaskRetriableError(enhancedError);
  }

  addLog.info('Finetune stage completed (tuned model auto-deployed to serving)', {
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
  const currentTask = await getRerankTrainTask(taskId);
  if (!currentTask) {
    addLog.warn('SFT task creation skipped because task was deleted', { taskId });
    throwTaskDeletedError();
  }

  if (currentTask.status === RerankTrainTaskStatusEnum.cancelled) {
    addLog.warn('SFT task creation skipped because task was cancelled', { taskId });
    throwTaskCancelledError();
  }
}

async function ensureTaskNotAborted({ taskId, sftTaskId }: { taskId: string; sftTaskId?: string }) {
  let abortReason: Awaited<ReturnType<typeof getTrainTaskAbortSignal>>;
  try {
    abortReason = await getTrainTaskAbortSignal({ type: 'rerank', taskId });
  } catch (error) {
    addLog.warn('Failed to check rerank train task abort signal', {
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
  const enhancedError = createRerankEnhancedError(
    RerankTaskCheckpointStageEnum.finetuning,
    RerankTrainErrEnum.rerankTaskNotExist,
    RerankTrainSuggestionEnum.rerankTaskNotExist
  );
  throw new TrainTaskUnrecoverableError(enhancedError);
}

function throwTaskCancelledError(): never {
  const enhancedError = createRerankEnhancedError(
    RerankTaskCheckpointStageEnum.finetuning,
    RerankTrainErrEnum.rerankFinetuneCancelled,
    RerankTrainSuggestionEnum.rerankFinetuneCancelled
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
