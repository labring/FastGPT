import { AicpTaskStatus } from './types';
import type {
  CreateAicpOptimizationTaskRequest,
  CreateAicpOptimizationTaskResponse,
  QueryAicpTaskStatusRequest,
  QueryAicpTaskStatusResponse
} from './types';
import { addLog } from '../../../../../common/system/log';

type MockTaskInfo = {
  taskId: string;
  createdAt: number;
  taskType: 'rerank' | 'embed';
  status: AicpTaskStatus;
};

const mockTasks = new Map<string, MockTaskInfo>();

/**
 * Mock implementation of AICP optimization task creation
 * Real implementation should call AICP platform's create_optimization_task API
 *
 * @param request - Contains dataset file, task type, and training parameters
 * @returns Task ID and creation status
 */
export async function mockCreateAicpOptimizationTask(
  request: CreateAicpOptimizationTaskRequest
): Promise<CreateAicpOptimizationTaskResponse> {
  addLog.info('[MOCK] AICP create optimization task', {
    taskType: request.taskType,
    parameters: request.parameters
  });

  await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000));

  const taskId = `aicp_task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  mockTasks.set(taskId, {
    taskId,
    createdAt: Date.now(),
    taskType: request.taskType,
    status: AicpTaskStatus.created
  });

  return {
    task_id: taskId,
    status: AicpTaskStatus.created,
    message: 'Optimization task created successfully'
  };
}

/**
 * Mock implementation of AICP task status query
 * Real implementation should call AICP platform's query_task_status API
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
export async function mockQueryAicpTaskStatus(
  request: QueryAicpTaskStatusRequest
): Promise<QueryAicpTaskStatusResponse> {
  const task = mockTasks.get(request.taskId);

  if (!task) {
    return {
      task_id: request.taskId,
      status: AicpTaskStatus.failed,
      message: 'Task not found',
      error: 'The specified task ID does not exist'
    };
  }

  const elapsedSeconds = (Date.now() - task.createdAt) / 1000;

  let currentStatus: AicpTaskStatus;
  let progress: number | undefined;
  let message: string;

  if (elapsedSeconds < 3) {
    currentStatus = AicpTaskStatus.created;
    progress = 0;
    message = 'Task created, waiting to start';
  } else if (elapsedSeconds < 9) {
    currentStatus = AicpTaskStatus.running;
    progress = Math.min(80, Math.floor(((elapsedSeconds - 3) / 6) * 80));
    message = 'Training in progress';
  } else if (elapsedSeconds < 12) {
    currentStatus = AicpTaskStatus.deploying;
    progress = Math.min(95, 80 + Math.floor(((elapsedSeconds - 9) / 3) * 15));
    message = 'Training completed, deploying model';
  } else {
    currentStatus = AicpTaskStatus.completed;
    progress = 100;
    message = 'Model deployed successfully';
  }

  task.status = currentStatus;

  const response: QueryAicpTaskStatusResponse = {
    task_id: request.taskId,
    status: currentStatus,
    progress,
    message
  };

  if (currentStatus === AicpTaskStatus.completed) {
    response.endpoint = {
      base_url: 'http://10.57.1.91:28624/v1',
      model: `bge-m3-test`,
      api_key: `GGlmUiIHZ5c2PGLg1wv2ULmJj2YMjF7fEx8P5s7vTcIHkzFotg`
    };
  }

  addLog.info('[MOCK] AICP query task status', {
    taskId: request.taskId,
    status: currentStatus,
    progress,
    elapsedSeconds: elapsedSeconds.toFixed(1)
  });

  return response;
}
