export enum EvalDatasetDataCreateFromEnum {
  manual = 'manual',
  fileImport = 'file_import',
  intelligentGeneration = 'intelligent_generation'
}

export const EvalDatasetDataCreateFromValues = Object.values(EvalDatasetDataCreateFromEnum);

export enum EvalDatasetCollectionStatusEnum {
  queuing = 'queuing',
  processing = 'processing',
  error = 'error',
  ready = 'ready'
}

export enum EvalDatasetDataQualityStatusEnum {
  unevaluated = 'unevaluated',
  queuing = 'queuing',
  evaluating = 'evaluating',
  error = 'error',
  completed = 'completed'
}

export enum EvalDatasetDataQualityResultEnum {
  highQuality = 'highQuality',
  needsOptimization = 'needsOptimization'
}

export enum EvalDatasetDataKeyEnum {
  UserInput = 'userInput',
  ActualOutput = 'actualOutput',
  ExpectedOutput = 'expectedOutput',
  Context = 'context',
  RetrievalContext = 'retrievalContext',
  Metadata = 'metadata'
}

export const EvalDatasetDataQualityStatusValues = Object.values(EvalDatasetDataQualityStatusEnum);
export const EvalDatasetDataQualityResultValues = Object.values(EvalDatasetDataQualityResultEnum);
