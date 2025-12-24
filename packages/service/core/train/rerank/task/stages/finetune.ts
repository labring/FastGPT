import { UnrecoverableError } from 'bullmq';
import * as fs from 'fs/promises';
import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { RerankTrainTaskStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { createSFTTask, querySFTTaskStatus, SFTTaskStatus } from '../../external';
import { addLog } from '../../../../../common/system/log';
import { getRerankTrainTask } from '../controller';
import {
  DEFAULT_SFT_BRIDGE_LEARNING_RATE,
  DEFAULT_SFT_BRIDGE_MAX_POLLS,
  DEFAULT_SFT_BRIDGE_POLL_INTERVAL
} from '../../constants';

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
    throw new UnrecoverableError('Dataset file path not found in checkpoint');
  }

  if (!task.baseModelEndpoint.model) {
    throw new UnrecoverableError('Base model endpoint model field is required');
  }

  const datasetFile = await fs.readFile(checkpointData.preparing.trainDatasetFilePath);

  const createResponse = await createSFTTask({
    datasetFile,
    taskType: 'rerank',
    parameters: {
      learning_rate: DEFAULT_SFT_BRIDGE_LEARNING_RATE,
      epochs: 3,
      batch_size: 32
    }
  });

  const sftTaskId = createResponse.task_id;

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
      throw new UnrecoverableError('Training task cancelled by user');
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
        throw new Error('SFT task completed but endpoint not returned');
      }
    } else if (statusResponse.status === SFTTaskStatus.failed) {
      throw new Error(`SFT task failed: ${statusResponse.error}`);
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
    throw new Error(
      `SFT task polling timeout after ${maxPolls} polls (${timeoutDuration}). ` +
        `Configure SFT_BRIDGE_MAX_POLLS and SFT_BRIDGE_POLL_INTERVAL environment variables to adjust timeout.`
    );
  }

  if (!endpoint) {
    throw new Error('SFT task completed but endpoint not available');
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
