import type { ReadStream } from 'fs';

/** Create optimization task request (multipart/form-data) */
export type CreateAicpOptimizationTaskRequest = {
  datasetFile: Buffer | ReadStream;
  taskType: 'rerank' | 'embed';
  parameters?: {
    learning_rate?: number;
    epochs?: number;
    batch_size?: number;
  };
};

/** Create optimization task response */
export type CreateAicpOptimizationTaskResponse = {
  task_id: string;
  status: AicpTaskStatus;
  message: string;
};

/** Query optimization task status request */
export type QueryAicpTaskStatusRequest = {
  taskId: string;
};

/** AICP task status enum (aligned with AICP API) */
export enum AicpTaskStatus {
  created = 'created',
  running = 'running',
  deploying = 'deploying',
  completed = 'completed',
  failed = 'failed'
}

/** Query optimization task status response */
export type QueryAicpTaskStatusResponse = {
  task_id: string;
  status: AicpTaskStatus;
  progress?: number;
  message: string;

  endpoint?: {
    base_url: string;
    model: string;
    api_key: string;
  };

  error?: string;
};
