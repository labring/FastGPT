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

export enum EmbeddingTrainTypeEnum {
  lora = 'lora',
  ptuning = 'ptuning'
}

export enum EmbeddingTaskCheckpointStageEnum {
  generate_trainset = 'generate_trainset',
  generate_evaldataset = 'generate_evaldataset',
  eval_basemodel = 'eval_basemodel',
  finetuning = 'finetuning',
  registering = 'registering',
  eval_tunedmodel = 'eval_tunedmodel'
}

export enum TrainDataSourceEnum {
  dataset = 'dataset',
  chat_log = 'chat_log',
  manual = 'manual'
}
