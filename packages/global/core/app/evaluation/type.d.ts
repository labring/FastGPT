import type { EvaluationStatusEnum } from './constants';

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
