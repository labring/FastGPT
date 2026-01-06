import { SFTTaskStatus } from './types';
import type {
  CreateSFTTaskRequest,
  CreateSFTTaskResponse,
  QuerySFTTaskStatusRequest,
  QuerySFTTaskStatusResponse,
  DeleteSFTTaskRequest,
  DeleteSFTTaskResponse
} from './types';
import { addLog } from '../../../../../common/system/log';

type MockTaskInfo = {
  taskId: string;
  createdAt: number;
  taskType: 'rerank' | 'embed';
  status: SFTTaskStatus;
};

const mockTasks = new Map<string, MockTaskInfo>();

/**
 * Mock implementation of SFT task creation
 * Real implementation should call SFT Bridge platform's create_optimization_task API
 *
 * @param request - Contains dataset file, task type, and training parameters
 * @returns Task ID and creation status
 */
export async function mockCreateSFTTask(
  request: CreateSFTTaskRequest
): Promise<CreateSFTTaskResponse> {
  addLog.info('[MOCK] SFT Bridge create optimization task', {
    taskType: request.taskType,
    parameters: request.parameters
  });

  await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000));

  const taskId = `SFT Bridge_task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  mockTasks.set(taskId, {
    taskId,
    createdAt: Date.now(),
    taskType: request.taskType,
    status: SFTTaskStatus.created
  });

  return {
    task_id: taskId,
    status: SFTTaskStatus.created,
    message: 'Optimization task created successfully'
  };
}

/**
 * Mock implementation of SFT Bridge task status query
 * Real implementation should call SFT Bridge platform's query_task_status API
 *
 * Status transition timeline (from creation time):
 * - 0-3s: created
 * - 3-9s: running
 * - 9-12s: deploying
 * - 12s+: completed
 *
 * @param request - Contains task ID
 * @returns Task status, progress, and endpoint information (if completed)
 */
export async function mockQuerySFTTaskStatus(
  request: QuerySFTTaskStatusRequest
): Promise<QuerySFTTaskStatusResponse> {
  const task = mockTasks.get(request.taskId);

  if (!task) {
    return {
      task_id: request.taskId,
      status: SFTTaskStatus.failed,
      message: 'Task not found',
      error: 'The specified task ID does not exist'
    };
  }

  const elapsedSeconds = (Date.now() - task.createdAt) / 1000;

  let currentStatus: SFTTaskStatus;
  let progress: number | undefined;
  let message: string;

  if (elapsedSeconds < 3) {
    currentStatus = SFTTaskStatus.created;
    progress = 0;
    message = 'Task created, waiting to start';
  } else if (elapsedSeconds < 9) {
    currentStatus = SFTTaskStatus.running;
    progress = Math.min(80, Math.floor(((elapsedSeconds - 3) / 6) * 80));
    message = 'Training in progress';
  } else if (elapsedSeconds < 12) {
    currentStatus = SFTTaskStatus.deploying;
    progress = Math.min(95, 80 + Math.floor(((elapsedSeconds - 9) / 3) * 15));
    message = 'Training completed, deploying model';
  } else {
    currentStatus = SFTTaskStatus.completed;
    progress = 100;
    message = 'Model deployed successfully';
  }

  task.status = currentStatus;

  const response: QuerySFTTaskStatusResponse = {
    task_id: request.taskId,
    status: currentStatus,
    progress,
    message
  };

  if (currentStatus === SFTTaskStatus.completed) {
    response.endpoint = {
      base_url: 'http://10.57.1.91:28624/v1',
      model: `bge-m3-test`,
      api_key: `GGlmUiIHZ5c2PGLg1wv2ULmJj2YMjF7fEx8P5s7vTcIHkzFotg`
    };
    // response.endpoint = {
    //   base_url: 'http://10.57.1.99:30083/v1',
    //   model: `bge-reranker-v2-m3`,
    //   api_key: `GHnjr4iM4feHS7U7wZuWTtyW3Mx3c6K6iJvArPMqbJxJzBvqeQ`
    // };
  }

  addLog.info('[MOCK] SFT Bridge query task status', {
    taskId: request.taskId,
    status: currentStatus,
    progress,
    elapsedSeconds: elapsedSeconds.toFixed(1)
  });

  return response;
}

/**
 * Mock implementation of SFT task deletion
 * Real implementation should call SFT Bridge platform's delete_task API
 *
 * @param request - Contains task ID to delete
 * @returns Deletion confirmation with task_id and message
 */
export async function mockDeleteSFTTask(
  request: DeleteSFTTaskRequest
): Promise<DeleteSFTTaskResponse> {
  addLog.info('[MOCK] SFT Bridge delete task', {
    taskId: request.taskId
  });

  await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 500));

  return {
    task_id: request.taskId,
    message: `Task ${request.taskId} deleted successfully (mock)`
  };
}
