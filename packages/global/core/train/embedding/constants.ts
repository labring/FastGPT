/**
 * Embedding 训练模块常量
 */

export enum EmbeddingTrainsetStatusEnum {
  pending = 'pending',
  generating = 'generating',
  ready = 'ready',
  error = 'error'
}

export enum EmbeddingTrainTaskStatusEnum {
  pending = 'pending',
  running = 'running',
  completed = 'completed',
  failed = 'failed',
  cancelled = 'cancelled'
}

export enum EmbeddingTrainMethodEnum {
  lora = 'lora',
  task_tuning = 'task_tuning'
}

export enum EmbeddingTaskCheckpointStageEnum {
  generate_trainset = 'generate_trainset',
  generate_evaldataset = 'generate_evaldataset',
  eval_basemodel = 'eval_basemodel',
  finetuning = 'finetuning',
  registering = 'registering',
  eval_tunedmodel = 'eval_tunedmodel'
}

export enum EmbeddingTrainDataSourceEnum {
  dataset = 'dataset',
  chat_log = 'chat_log',
  manual = 'manual'
}
