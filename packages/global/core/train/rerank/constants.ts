/** Rerank trainset status */
export enum RerankTrainsetStatusEnum {
  pending = 'pending', // Pending (initial state, waiting to generate data)
  generating = 'generating', // Generating (creating data from associated dataset chunks)
  ready = 'ready', // Ready
  error = 'error' // Error
}

/** Training data source */
export enum TrainDataSourceEnum {
  dataset = 'dataset', // Generated from dataset
  chat_log = 'chat_log', // Converted from chat logs
  manual = 'manual' // Manually added
}

/** Training task status */
export enum RerankTrainTaskStatusEnum {
  pending = 'pending',
  running = 'running',
  completed = 'completed',
  failed = 'failed',
  cancelled = 'cancelled'
}

/** Training task checkpoint stage */
export enum RerankTaskCheckpointStageEnum {
  preparing = 'preparing',
  finetuning = 'finetuning', // Model fine-tuning (AICP executes fine-tuning and auto-deploys)
  registering = 'registering', // Model registration (register configuration in FastGPT)
  evaluating = 'evaluating',
  applying = 'applying' // Apply update (apply fine-tuned model to app workflow)
}
