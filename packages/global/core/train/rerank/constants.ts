/** Rerank trainset status */
export enum RerankTrainsetStatusEnum {
  pending = 'pending', // Pending (initial state, waiting to generate data)
  generating = 'generating', // Generating (creating data from associated dataset chunks)
  ready = 'ready', // Ready
  error = 'error' // Error
}

/** Training data source */
export enum RerankTrainDataSourceEnum {
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

/** Training type */
export enum RerankTrainMethodEnum {
  lora = 'lora',
  task_tuning = 'task_tuning'
}

/** Training task checkpoint stage */
export enum RerankTaskCheckpointStageEnum {
  generate_trainset = 'generate_trainset', // Generate training set (renamed from preparing; auto mode: create trainset + trigger data gen; exact mode: wait for ready)
  generate_evaldataset = 'generate_evaldataset', // Generate eval dataset (moved before finetuning; auto mode: call DiTing; exact mode: skip)
  eval_basemodel = 'eval_basemodel', // Evaluate base model to establish baseline
  finetuning = 'finetuning', // Model fine-tuning (sft bridge executes fine-tuning and auto-deploys)
  registering = 'registering', // Model registration (register configuration in FastGPT)
  eval_tunedmodel = 'eval_tunedmodel', // Evaluate fine-tuned model, compare with baseline
  llm_judge = 'llm_judge' // LLM-based relevance judgment, re-compute metrics with judged expectedContextIds
}
