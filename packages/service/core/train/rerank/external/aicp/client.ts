import axios from 'axios';
import FormData from 'form-data';
import type {
  CreateAicpOptimizationTaskRequest,
  CreateAicpOptimizationTaskResponse,
  QueryAicpTaskStatusRequest,
  QueryAicpTaskStatusResponse
} from './types';
import { AicpTaskStatus } from './types';
import { addLog } from '../../../../../common/system/log';
import { DEFAULT_AICP_TIMEOUT } from '../../constants';

/**
 * AICP platform real client for optimization task creation and status query
 */

function getAicpConfig() {
  return {
    url: process.env.AICP_BASE_URL || 'http://aicp-client:3000',
    timeout: Number(process.env.AICP_TIMEOUT) || DEFAULT_AICP_TIMEOUT
  };
}

function getAicpEndpoint(): string {
  return getAicpConfig().url;
}

function getAicpTimeout(): number {
  return getAicpConfig().timeout;
}

/**
 * Create AICP optimization task
 * Calls AICP platform /api/v1/optimization/tasks endpoint
 *
 * @param request - Contains dataset file, task type, and training parameters
 * @returns Task ID and creation status
 */
export async function createAicpOptimizationTask(
  request: CreateAicpOptimizationTaskRequest
): Promise<CreateAicpOptimizationTaskResponse> {
  const endpoint = getAicpEndpoint();
  const url = `${endpoint}/api/v1/optimization/tasks`;

  addLog.info('AICP create optimization task', {
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
      timeout: getAicpTimeout(),
      headers: {
        ...formData.getHeaders()
      }
    });

    const apiResponse = response.data;

    if (!apiResponse.task_id || apiResponse.status !== 'pending') {
      throw new Error('Invalid response from AICP API');
    }

    addLog.info('AICP create optimization task completed', {
      taskId: apiResponse.task_id,
      status: apiResponse.status
    });

    return {
      task_id: apiResponse.task_id,
      status: apiResponse.status,
      message: apiResponse.message || 'Optimization task created successfully'
    };
  } catch (error) {
    addLog.error('AICP create optimization task failed', {
      error: error instanceof Error ? error.message : String(error)
    });

    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data?.message || error.message;
      throw new Error(`AICP API error: ${errorMessage}`);
    }

    throw error;
  }
}

/**
 * Query AICP task status
 * Calls AICP platform /api/v1/optimization/tasks/{task_id} endpoint
 *
 * @param request - Contains task ID
 * @returns Task status, progress, and endpoint information (if completed)
 */
export async function queryAicpTaskStatus(
  request: QueryAicpTaskStatusRequest
): Promise<QueryAicpTaskStatusResponse> {
  const endpoint = getAicpEndpoint();
  const url = `${endpoint}/api/v1/optimization/tasks/${request.taskId}`;

  addLog.info('AICP query task status', {
    url,
    taskId: request.taskId
  });

  try {
    const response = await axios.get(url, {
      timeout: getAicpTimeout()
    });

    const apiResponse = response.data;

    if (!apiResponse.task_id || !apiResponse.status) {
      throw new Error('Invalid response from AICP API');
    }

    addLog.info('AICP query task status completed', {
      taskId: apiResponse.task_id,
      status: apiResponse.status,
      progress: apiResponse.progress
    });

    const result: QueryAicpTaskStatusResponse = {
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
    addLog.error('AICP query task status failed', {
      taskId: request.taskId,
      error: error instanceof Error ? error.message : String(error)
    });

    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return {
        task_id: request.taskId,
        status: AicpTaskStatus.failed,
        message: 'Task not found',
        error: 'The specified task ID does not exist'
      };
    }

    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data?.message || error.message;
      throw new Error(`AICP API error: ${errorMessage}`);
    }

    throw error;
  }
}
