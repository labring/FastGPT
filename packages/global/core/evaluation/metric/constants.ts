export enum EvalMetricTypeEnum {
  Custom = 'custom_metric',
  Builtin = 'builtin_metric'
}
export const EvalMetricTypeValues = Object.values(EvalMetricTypeEnum);

export enum ModelTypeEnum {
  LLM = 'llm',
  EMBED = 'embed'
}
export const ModelTypeValues = Object.values(ModelTypeEnum);

export enum EvaluationStatusEnum {
  Success = 'success',
  Failed = 'failed',
}
export const EvaluationStatusValues = Object.values(EvaluationStatusEnum);
