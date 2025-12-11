import { UnrecoverableError } from 'bullmq';
import * as fs from 'fs/promises';
import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { RerankTrainTaskStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { createAicpOptimizationTask, queryAicpTaskStatus, AicpTaskStatus } from '../../external';
import { addLog } from '../../../../../common/system/log';
import { getRerankTrainTask } from '../controller';
import {
  DEFAULT_AICP_LEARNING_RATE,
  DEFAULT_AICP_MAX_POLLS,
  DEFAULT_AICP_POLL_INTERVAL
} from '../../constants';

/**
 * Stage 2: Model Finetuning
 *
 * Calls AICP training platform, uploads JSONL dataset.
 * AICP automatically completes finetuning and deploys to inference service.
 *
 * @param task - Training task data
 * @returns AICP task ID and tuned model endpoint
 * @throws {UnrecoverableError} When dataset file or base model endpoint not found
 */
export async function runFinetuneStage(task: RerankTrainTaskSchemaType): Promise<{
  aicpTaskId: string;
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

  const createResponse = await createAicpOptimizationTask({
    datasetFile,
    taskType: 'rerank',
    parameters: {
      learning_rate: DEFAULT_AICP_LEARNING_RATE,
      epochs: 3,
      batch_size: 32
    }
  });

  const aicpTaskId = createResponse.task_id;

  addLog.info('Created AICP optimization task', {
    taskId: String(task._id),
    aicpTaskId
  });

  let completed = false;
  let endpoint:
    | {
        base_url: string;
        model: string;
        api_key: string;
      }
    | undefined = undefined;

  const maxPolls = Number(process.env.AICP_MAX_POLLS) || DEFAULT_AICP_MAX_POLLS;
  const pollInterval = Number(process.env.AICP_POLL_INTERVAL) || DEFAULT_AICP_POLL_INTERVAL;

  addLog.info('AICP task polling configuration', {
    taskId: String(task._id),
    maxPolls,
    pollInterval,
    maxDuration: `${(maxPolls * pollInterval) / 1000 / 60} minutes`
  });

  let pollCount = 0;

  while (!completed && pollCount < maxPolls) {
    const currentTask = await getRerankTrainTask(String(task._id));
    if (currentTask?.status === RerankTrainTaskStatusEnum.cancelled) {
      addLog.warn('AICP task polling cancelled by user', {
        taskId: String(task._id),
        aicpTaskId
      });
      throw new UnrecoverableError('Training task cancelled by user');
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    const statusResponse = await queryAicpTaskStatus({
      taskId: aicpTaskId
    });

    addLog.info('AICP task status', {
      taskId: String(task._id),
      aicpTaskId,
      status: statusResponse.status,
      progress: statusResponse.progress
    });

    if (statusResponse.status === AicpTaskStatus.completed) {
      completed = true;
      endpoint = statusResponse.endpoint;

      if (!endpoint) {
        throw new Error('AICP task completed but endpoint not returned');
      }
    } else if (statusResponse.status === AicpTaskStatus.failed) {
      throw new Error(`AICP task failed: ${statusResponse.error}`);
    }

    pollCount++;
  }

  if (!completed) {
    const timeoutDuration = `${(maxPolls * pollInterval) / 1000 / 60} minutes`;
    addLog.error('AICP task polling timeout', {
      taskId: String(task._id),
      aicpTaskId,
      maxPolls,
      pollInterval,
      timeoutDuration
    });
    throw new Error(
      `AICP task polling timeout after ${maxPolls} polls (${timeoutDuration}). ` +
        `Configure AICP_MAX_POLLS and AICP_POLL_INTERVAL environment variables to adjust timeout.`
    );
  }

  if (!endpoint) {
    throw new Error('AICP task completed but endpoint not available');
  }

  addLog.info('Finetune stage completed (AICP auto-deployed to serving)', {
    taskId: String(task._id),
    baseModelConfigId: task.baseModelConfigId,
    baseModelEndpoint: task.baseModelEndpoint,
    tunedModelEndpoint: endpoint
  });

  return {
    aicpTaskId,
    tunedModelEndpoint: endpoint
  };
}
