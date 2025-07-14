import type { PaginationProps } from '@fastgpt/web/common/fetch/type';

export type listEvaluationsBody = PaginationProps<{
  searchKey?: string;
}>;

export type listEvalItemsBody = PaginationProps<{
  evalId: string;
  appId: string;
}>;

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
