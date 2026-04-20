import type { ReadStream } from 'fs';
import type { EmbeddingTrainMethodEnum } from '@fastgpt/global/core/train/embedding/constants';
import type { RerankTrainMethodEnum } from '@fastgpt/global/core/train/rerank/constants';

/** Create SFT task request (multipart/form-data) */
export type CreateSFTTaskRequest = {
  datasetFile: Buffer | ReadStream;
  taskType: 'rerank' | 'embed';
  trainMethod?: `${EmbeddingTrainMethodEnum}` | `${RerankTrainMethodEnum}`; // Training type: lora or task_tuning
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

/** Delete SFT task request */
export type DeleteSFTTaskRequest = {
  taskId: string; // SFT Bridge task ID
};

/** Delete SFT task response */
export type DeleteSFTTaskResponse = {
  task_id: string;
  message: string;
};
