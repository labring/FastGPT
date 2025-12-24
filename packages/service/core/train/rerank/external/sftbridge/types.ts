import type { ReadStream } from 'fs';

/** Create SFT task request (multipart/form-data) */
export type CreateSFTTaskRequest = {
  datasetFile: Buffer | ReadStream;
  taskType: 'rerank' | 'embed';
  parameters?: {
    learning_rate?: number;
    epochs?: number;
    batch_size?: number;
  };
};

/** Create SFT task response */
export type CreateSFTTaskResponse = {
  task_id: string;
  status: SFTTaskStatus;
  message: string;
};

/** Query SFT task status request */
export type QuerySFTTaskStatusRequest = {
  taskId: string;
};

/** SFT task status enum */
export enum SFTTaskStatus {
  created = 'created',
  running = 'running',
  deploying = 'deploying',
  completed = 'completed',
  failed = 'failed'
}

/** Query SFT task status response */
export type QuerySFTTaskStatusResponse = {
  task_id: string;
  status: SFTTaskStatus;
  progress?: number;
  message: string;

  endpoint?: {
    base_url: string;
    model: string;
    api_key: string;
  };

  error?: string;
};
