import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';

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
};

export type listEvalItemsItem = {
  evalItemId: string;
  question: string;
  expectedResponse: string;
  response: string;
  variables: Record<string, string>;
  status: -1 | 0 | 1 | 2;
  errorMessage: string;
  accuracy: number;
  relevance: number;
  semanticAccuracy: number;
  score: number;
};
