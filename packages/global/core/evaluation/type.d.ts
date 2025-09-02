import type {
  EvaluationStatusEnum,
  EvalDatasetDataCreateFromEnum,
  EvalDatasetCollectionStatusEnum,
  EvalDatasetDataQualityStatusEnum,
  EvalDatasetDataKeyEnum
} from './constants';

export type EvalDatasetCollectionStatus = EvalDatasetCollectionStatusEnum;
export type EvalDatasetDataQualityStatus = EvalDatasetDataQualityStatusEnum;

export type EvaluationSchemaType = {
  _id: string;
  teamId: string;
  tmbId: string;
  evalModel: string;
  appId: string;
  usageId: string;
  name: string;
  createTime: Date;
  finishTime?: Date;
  score?: number;
  errorMessage?: string;
};

export type EvalItemSchemaType = {
  evalId: string;
  question: string;
  expectedResponse: string;
  globalVariables?: Record<string, any>;
  history?: string;
  response?: string;
  responseTime?: Date;
  finishTime?: Date;
  status: EvaluationStatusEnum;
  retry: number;
  errorMessage?: string;
  accuracy?: number;
  relevance?: number;
  semanticAccuracy?: number;
  score?: number;
};

export type evaluationType = Pick<
  EvaluationSchemaType,
  'name' | 'appId' | 'createTime' | 'finishTime' | 'evalModel' | 'errorMessage' | 'score'
> & {
  _id: string;
  executorAvatar: string;
  executorName: string;
  appAvatar: string;
  appName: string;
  completedCount: number;
  errorCount: number;
  totalCount: number;
};

export type listEvalItemsItem = EvalItemSchemaType & {
  evalItemId: string;
};

export type EvalDatasetCollectionSchemaType = {
  _id: string;
  teamId: string;
  tmbId: string;
  name: string;
  description: string;
  createTime: Date;
  updateTime: Date;
  metadata: Record<string, any>;
};

export type EvalDatasetDataSchemaType = {
  _id: string;
  teamId: string;
  tmbId: string;
  datasetId: string;
  [EvalDatasetDataKeyEnum.UserInput]: string;
  [EvalDatasetDataKeyEnum.ActualOutput]: string;
  [EvalDatasetDataKeyEnum.ExpectedOutput]: string;
  [EvalDatasetDataKeyEnum.Context]: string[];
  [EvalDatasetDataKeyEnum.RetrievalContext]: string[];
  metadata: Record<string, any>;
  createFrom: EvalDatasetDataCreateFromEnum;
  createTime: Date;
  updateTime: Date;
};
