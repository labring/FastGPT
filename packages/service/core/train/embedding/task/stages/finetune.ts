import * as fs from 'fs/promises';
import type { EmbeddingTrainTaskSchemaType } from '@fastgpt/global/core/train/embedding/type';
import {
  EmbeddingTrainTaskStatusEnum,
  EmbeddingTaskCheckpointStageEnum
} from '@fastgpt/global/core/train/embedding/constants';
import { createSFTTask, querySFTTaskStatus, SFTTaskStatus } from '../../external';
import { addLog } from '../../../../../common/system/log';
import { getEmbeddingTrainTask } from '../controller';
import {
  DEFAULT_SFT_BRIDGE_LEARNING_RATE,
  DEFAULT_SFT_BRIDGE_MAX_POLLS,
  DEFAULT_SFT_BRIDGE_POLL_INTERVAL
} from '../../constants';
import { createEmbeddingEnhancedError } from '../../utils';
import {
  EmbeddingTrainErrEnum,
  EmbeddingTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import { TrainTaskUnrecoverableError, TrainTaskRetriableError } from '../../../common/errors';

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

  let sftTaskId: string;
  try {
    const createResponse = await createSFTTask({
      datasetFile,
      taskType: 'embed', // Key difference from rerank (SFT Bridge uses 'embed' for embedding)
      trainMethod: task.trainMethod || 'lora',
      parameters: {
        learning_rate: DEFAULT_SFT_BRIDGE_LEARNING_RATE,
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

  const maxPolls = Number(process.env.SFT_BRIDGE_MAX_POLLS) || DEFAULT_SFT_BRIDGE_MAX_POLLS;
  const pollInterval =
    Number(process.env.SFT_BRIDGE_POLL_INTERVAL) || DEFAULT_SFT_BRIDGE_POLL_INTERVAL;

  addLog.info('SFT task polling configuration (embedding)', {
    taskId: String(task._id),
    maxPolls,
    pollInterval,
    maxDuration: `${(maxPolls * pollInterval) / 1000 / 60} minutes`
  });

  let pollCount = 0;

  while (!completed && pollCount < maxPolls) {
    const currentTask = await getEmbeddingTrainTask(String(task._id));
    if (currentTask?.status === EmbeddingTrainTaskStatusEnum.cancelled) {
      addLog.warn('SFT task polling cancelled by user', {
        taskId: String(task._id),
        sftTaskId
      });
      const enhancedError = createEmbeddingEnhancedError(
        EmbeddingTaskCheckpointStageEnum.finetuning,
        EmbeddingTrainErrEnum.embeddingFinetuneCancelled,
        EmbeddingTrainSuggestionEnum.embeddingFinetuneCancelled
      );
      throw new TrainTaskUnrecoverableError(enhancedError);
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));

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
