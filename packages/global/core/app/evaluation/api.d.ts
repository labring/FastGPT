import type { PaginationProps } from '@fastgpt/web/common/fetch/type';

export type listEvaluationsBody = PaginationProps<{
  searchKey?: string;
}>;

export type listEvalItemsBody = PaginationProps<{
  evalId: string;
}>;

export type retryEvalItemBody = {
  evalItemId: string;
};

export type updateEvalItemBody = {
  evalItemId: string;
  question: string;
  expectedResponse: string;
  variables: Record<string, string>;
};
