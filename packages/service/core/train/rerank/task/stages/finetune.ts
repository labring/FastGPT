import * as fs from 'fs/promises';
import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import {
  RerankTrainTaskStatusEnum,
  RerankTaskCheckpointStageEnum
} from '@fastgpt/global/core/train/rerank/constants';
import { createSFTTask, querySFTTaskStatus, SFTTaskStatus } from '../../external';
import { addLog } from '../../../../../common/system/log';
import { getRerankTrainTask } from '../controller';
import {
  DEFAULT_SFT_BRIDGE_LEARNING_RATE,
  DEFAULT_SFT_BRIDGE_MAX_POLLS,
  DEFAULT_SFT_BRIDGE_POLL_INTERVAL
} from '../../constants';
import { createRerankEnhancedError } from '../../utils';
import {
  RerankTrainErrEnum,
  RerankTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import { TrainTaskUnrecoverableError, TrainTaskRetriableError } from '../../../common/errors';

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
  if (!checkpointData.generate_trainset?.trainDatasetFilePath) {
    const enhancedError = createRerankEnhancedError(
      RerankTaskCheckpointStageEnum.finetuning,
      RerankTrainErrEnum.rerankFinetuneDataPathNotFound,
      RerankTrainSuggestionEnum.rerankFinetuneDataPathNotFound
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  if (!task.baseModelEndpoint.model) {
    const enhancedError = createRerankEnhancedError(
      RerankTaskCheckpointStageEnum.finetuning,
      RerankTrainErrEnum.rerankFinetuneModelConfigInvalid,
      RerankTrainSuggestionEnum.rerankFinetuneModelConfigInvalid
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

  let sftTaskId: string;
  try {
    const createResponse = await createSFTTask({
      datasetFile,
      taskType: 'rerank',
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
    const enhancedError = createRerankEnhancedError(
      RerankTaskCheckpointStageEnum.finetuning,
      RerankTrainErrEnum.rerankFinetuneSftBridgeCreateFailed,
      RerankTrainSuggestionEnum.rerankFinetuneSftBridgeCreateFailed,
      errorMsg
    );
    throw new TrainTaskRetriableError(enhancedError);
  }

  addLog.info('Created SFT task', {
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

  addLog.info('SFT task polling configuration', {
    taskId: String(task._id),
    maxPolls,
    pollInterval,
    maxDuration: `${(maxPolls * pollInterval) / 1000 / 60} minutes`
  });

  let pollCount = 0;

  while (!completed && pollCount < maxPolls) {
    const currentTask = await getRerankTrainTask(String(task._id));
    if (currentTask?.status === RerankTrainTaskStatusEnum.cancelled) {
      addLog.warn('SFT task polling cancelled by user', {
        taskId: String(task._id),
        sftTaskId
      });
      const enhancedError = createRerankEnhancedError(
        RerankTaskCheckpointStageEnum.finetuning,
        RerankTrainErrEnum.rerankFinetuneCancelled,
        RerankTrainSuggestionEnum.rerankFinetuneCancelled
      );
      throw new TrainTaskUnrecoverableError(enhancedError);
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));

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
