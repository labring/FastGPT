import type { EvaluationStatusEnum } from './constants';

export type evaluationType = {
  _id: string;
  name: string;
  executorAvatar: string;
  executorName: string;
  appAvatar: string;
  appName: string;
  appId: string;
  createTime: Date;
  finishTime?: Date;
  score: string | null;
  completedCount: number;
  errorCount: number;
  totalCount: number;
  evalModel: string;
  errorMessage?: string;
};

export type listEvalItemsItem = {
  evalItemId: string;
  question: string;
  expectedResponse: string;
  response: string;
  variables: Record<string, string>;
  status: EvaluationStatusEnum;
  errorMessage: string;
  accuracy: number;
  relevance: number;
  semanticAccuracy: number;
  score: number;
};
