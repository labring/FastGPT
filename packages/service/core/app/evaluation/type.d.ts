import type { EvaluationStatusEnum } from '@fastgpt/global/core/app/evaluation/constants';

export type EvaluationSchemaType = {
  teamId: string;
  tmbId: string;
  agentModel: string;
  appId: string;
  name: string;
  createTime: Date;
  finishTime?: Date;
  score?: number;
};

export type EvalItemSchemaType = {
  evalId: string;
  question: string;
  expectedResponse: string;
  globalVariales?: Record<string, any>;
  history?: string;
  response?: string;
  status: EvaluationStatusEnum;
  retry: number;
  errorMessage?: string;
  accuracy?: number;
  relevance?: number;
  semanticAccuracy?: number;
  score?: number;
};
