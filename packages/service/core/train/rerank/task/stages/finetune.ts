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
import { createEnhancedError } from '../../utils';
import { TrainTaskErrorType } from '@fastgpt/global/core/train/rerank/error';
import { TrainTaskUnrecoverableError, TrainTaskRetriableError } from '../errors';

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
  if (!checkpointData.preparing?.trainDatasetFilePath) {
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.finetuning,
      TrainTaskErrorType.DATA_INVALID,
      'Training dataset file path not found from preparation stage',
      'Please check if data preparation stage completed correctly, or re-run the training task'
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  if (!task.baseModelEndpoint.model) {
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.finetuning,
      TrainTaskErrorType.MODEL_CONFIG_INVALID,
      'Base model endpoint configuration missing model field',
      'Please check the Rerank model configuration in the app and ensure model is properly configured'
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  let datasetFile: Buffer;
  try {
    datasetFile = await fs.readFile(checkpointData.preparing.trainDatasetFilePath);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.finetuning,
      TrainTaskErrorType.DATA_FILE_NOT_FOUND,
      `Failed to read training data file: ${errorMsg}`,
      'Training data file may have been deleted or is inaccessible. Please re-run the training task',
      errorMsg
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  let sftTaskId: string;
  try {
    const createResponse = await createSFTTask({
      datasetFile,
      taskType: 'rerank',
      parameters: {
        learning_rate: DEFAULT_SFT_BRIDGE_LEARNING_RATE,
        epochs: 3,
        batch_size: 32
      }
    });

    sftTaskId = createResponse.task_id;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.finetuning,
      TrainTaskErrorType.SERVICE_API_ERROR,
      `Failed to create SFT Bridge training task: ${errorMsg}`,
      'Please check SFT Bridge configuration (SFT_BRIDGE_API_ENDPOINT and SFT_BRIDGE_API_TOKEN) and ensure the service is accessible',
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
      const enhancedError = createEnhancedError(
        RerankTaskCheckpointStageEnum.finetuning,
        TrainTaskErrorType.CANCELLED,
        'User cancelled the training task'
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
        const enhancedError = createEnhancedError(
          RerankTaskCheckpointStageEnum.finetuning,
          TrainTaskErrorType.MODEL_DEPLOYMENT_FAILED,
          'SFT Bridge task completed but model endpoint information not returned',
          'Please check SFT Bridge service configuration, or contact system administrator'
        );
        throw new TrainTaskRetriableError(enhancedError);
      }
    } else if (statusResponse.status === SFTTaskStatus.failed) {
      const enhancedError = createEnhancedError(
        RerankTaskCheckpointStageEnum.finetuning,
        TrainTaskErrorType.MODEL_TRAINING_FAILED,
        `SFT Bridge training task failed: ${statusResponse.error || 'Unknown error'}`,
        'Please check if training data format is correct, or check SFT Bridge service logs for detailed error information',
        statusResponse.error
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
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.finetuning,
      TrainTaskErrorType.TIMEOUT,
      `SFT Bridge task polling timeout, waited ${timeoutDuration} (${maxPolls} polls)`,
      `Training may require more time, please adjust timeout configuration via environment variables SFT_BRIDGE_MAX_POLLS and SFT_BRIDGE_POLL_INTERVAL, or check SFT Bridge service status`
    );
    throw new TrainTaskRetriableError(enhancedError);
  }

  if (!endpoint) {
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.finetuning,
      TrainTaskErrorType.MODEL_DEPLOYMENT_FAILED,
      'SFT Bridge task completed but model endpoint information is unavailable',
      'Please contact system administrator to check SFT Bridge service configuration'
    );
    throw new TrainTaskRetriableError(enhancedError);
  }

  addLog.info('Finetune stage completed (tuned model auto-deployed to serving)', {
    taskId: String(task._id),
    baseModelConfigId: task.baseModelConfigId,
    baseModelEndpoint: task.baseModelEndpoint,
    tunedModelEndpoint: endpoint
  });

  return {
    sftTaskId,
    tunedModelEndpoint: endpoint
  };
}
