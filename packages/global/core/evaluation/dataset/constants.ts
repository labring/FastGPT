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
  queuing = 'queuing',
  evaluating = 'evaluating',
  error = 'error',
  completed = 'completed'
}

export enum EvalDatasetDataKeyEnum {
  UserInput = 'userInput',
  ActualOutput = 'actualOutput',
  ExpectedOutput = 'expectedOutput',
  Context = 'context',
  RetrievalContext = 'retrievalContext'
}

export const EvalDatasetDataQualityStatusValues = Object.values(EvalDatasetDataQualityStatusEnum);
