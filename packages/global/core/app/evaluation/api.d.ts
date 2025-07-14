import type { evaluationType, listEvalItemsItem } from './type';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';

export type rerunEvalItemBody = {
  evalItemId: string;
};
export type rerunEvalItemResponse = {
  message: string;
  status: 'queued' | 'processing';
};

export type updateEvalItemBody = {
  evalItemId: string;
  question: string;
  expectedResponse: string;
  variables: Record<string, string>;
};
export type updateEvalItemResponse = {
  message: string;
  status: 'queued' | 'processing';
};

export type listEvaluationsBody = PaginationProps<{
  searchKey?: string;
}>;
export type listEvaluationsResponse = PaginationResponse<evaluationType>;

export type deleteEvaluationQuery = {
  evalId: string;
};
export type deleteEvaluationResponse = {};

export type deleteItemQuery = {
  evalItemId: string;
};
export type deleteItemResponse = {};

export type listEvalItemsBody = PaginationProps<{
  evalId: string;
  appId: string;
}>;
export type listEvalItemsResponse = PaginationResponse<listEvalItemsItem>;

export type createEvaluationBody = {
  name: string;
  appId: string;
  evalModel: string;
  file: File;
};
export type createEvaluationResponse = Record<string, never> | { error: string };

export type exportItemsQuery = {
  evalId: string;
  appId: string;
};

export type exportItemsBody = {
  title: string;
  statusMap: Record<string, { label: string }>;
};
