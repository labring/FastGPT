import axios from 'axios';
import FormData from 'form-data';
import type {
  CreateSFTTaskRequest,
  CreateSFTTaskResponse,
  QuerySFTTaskStatusRequest,
  QuerySFTTaskStatusResponse,
  DeleteSFTTaskRequest,
  DeleteSFTTaskResponse
} from './types';
import { SFTTaskStatus } from './types';
import { addLog } from '../../../../../common/system/log';
import { DEFAULT_SFT_BRIDGE_TIMEOUT } from '../../constants';

/**
 * SFT Bridge platform real client for optimization task creation and status query
 */

function getSFTBridgeConfig() {
  return {
    url: process.env.SFT_BRIDGE_BASE_URL || 'http://sft-bridge:3000',
    timeout: Number(process.env.SFT_BRIDGE_TIMEOUT) || DEFAULT_SFT_BRIDGE_TIMEOUT
  };
}

function getSFTBridgeEndpoint(): string {
  return getSFTBridgeConfig().url;
}

function getSFTBridgeTimeout(): number {
  return getSFTBridgeConfig().timeout;
}

/**
 * Create SFT task
 * Calls SFT Bridge platform /api/v1/optimization/tasks endpoint
 *
 * @param request - Contains dataset file, task type, and training parameters
 * @returns Task ID and creation status
 */
export async function createSFTTask(request: CreateSFTTaskRequest): Promise<CreateSFTTaskResponse> {
  const endpoint = getSFTBridgeEndpoint();
  const url = `${endpoint}/api/v1/optimization/tasks`;

  addLog.info('SFT Bridge create optimization task', {
    url,
    taskType: request.taskType,
    hasParameters: !!request.parameters
  });

  try {
    const formData = new FormData();
    formData.append('dataset', request.datasetFile, {
      filename: 'dataset.jsonl',
      contentType: 'application/jsonl'
    });
    formData.append('task_type', request.taskType);

    if (request.parameters) {
      formData.append('parameters', JSON.stringify(request.parameters));
    }

    const response = await axios.post(url, formData, {
      timeout: getSFTBridgeTimeout(),
      headers: {
        ...formData.getHeaders()
      }
    });

    const apiResponse = response.data;

    if (!apiResponse.task_id || apiResponse.status !== 'pending') {
      throw new Error('Invalid response from SFT Bridge API');
    }

    addLog.info('SFT Bridge create optimization task completed', {
      taskId: apiResponse.task_id,
      status: apiResponse.status
    });

    return {
      task_id: apiResponse.task_id,
      status: apiResponse.status,
      message: apiResponse.message || 'Optimization task created successfully'
    };
  } catch (error) {
    addLog.error('SFT Bridge create optimization task failed', {
      error: error instanceof Error ? error.message : String(error)
    });

    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data?.message || error.message;
      throw new Error(`SFT Bridge API error: ${errorMessage}`);
    }

    throw error;
  }
}

/**
 * Query SFT Bridge task status
 * Calls SFT Bridge platform /api/v1/optimization/tasks/{task_id} endpoint
 *
 * @param request - Contains task ID
 * @returns Task status, progress, and endpoint information (if completed)
 */
export async function querySFTTaskStatus(
  request: QuerySFTTaskStatusRequest
): Promise<QuerySFTTaskStatusResponse> {
  const endpoint = getSFTBridgeEndpoint();
  const url = `${endpoint}/api/v1/optimization/tasks/${request.taskId}`;

  addLog.info('SFT Bridge query task status', {
    url,
    taskId: request.taskId
  });

  try {
    const response = await axios.get(url, {
      timeout: getSFTBridgeTimeout()
    });

    const apiResponse = response.data;

    if (!apiResponse.task_id || !apiResponse.status) {
      throw new Error('Invalid response from SFT Bridge API');
    }

    addLog.info('SFT Bridge query task status completed', {
      taskId: apiResponse.task_id,
      status: apiResponse.status,
      progress: apiResponse.progress
    });

    const result: QuerySFTTaskStatusResponse = {
      task_id: apiResponse.task_id,
      status: apiResponse.status,
      message: apiResponse.message || ''
    };

    if (apiResponse.progress !== undefined) {
      result.progress = apiResponse.progress;
    }

    if (apiResponse.endpoint) {
      result.endpoint = {
        base_url: apiResponse.endpoint.base_url,
        model: apiResponse.endpoint.model,
        api_key: apiResponse.endpoint.api_key
      };
    }

    if (apiResponse.error) {
      result.error = apiResponse.error;
    }

    return result;
  } catch (error) {
    addLog.error('SFT Bridge query task status failed', {
      taskId: request.taskId,
      error: error instanceof Error ? error.message : String(error)
    });

    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return {
        task_id: request.taskId,
        status: SFTTaskStatus.failed,
        message: 'Task not found',
        error: 'The specified task ID does not exist'
      };
    }

    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data?.message || error.message;
      throw new Error(`SFT Bridge API error: ${errorMessage}`);
    }

    throw error;
  }
}

/**
 * Delete SFT task
 * Calls SFT Bridge platform /api/v1/optimization/tasks/{task_id} endpoint
 *
 * @param request - Contains task ID to delete
 * @returns Deletion confirmation with task_id and message
 */
export async function deleteSFTTask(request: DeleteSFTTaskRequest): Promise<DeleteSFTTaskResponse> {
  const endpoint = getSFTBridgeEndpoint();
  const url = `${endpoint}/api/v1/optimization/tasks/${encodeURIComponent(request.taskId)}`;

  addLog.info('SFT Bridge delete task', {
    url,
    taskId: request.taskId
  });

  try {
    const response = await axios.delete(url, {
      timeout: getSFTBridgeTimeout()
    });

    const apiResponse = response.data;

    addLog.info('SFT Bridge delete task completed', {
      taskId: request.taskId,
      response: apiResponse
    });

    return {
      task_id: apiResponse.task_id,
      message: apiResponse.message || 'Task deleted successfully'
    };
  } catch (error) {
    addLog.error('SFT Bridge delete task failed', {
      taskId: request.taskId,
      error: error instanceof Error ? error.message : String(error)
    });

    if (axios.isAxiosError(error) && error.response?.status === 404) {
      // Task not found - return success with appropriate message
      return {
        task_id: request.taskId,
        message: 'Task not found or already deleted'
      };
    }

    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data?.message || error.message;
      throw new Error(`SFT Bridge API error: ${errorMessage}`);
    }

    throw error;
  }
}
