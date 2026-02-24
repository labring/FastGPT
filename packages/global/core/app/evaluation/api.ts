import type { RequireOnlyOne } from '../../../common/type/utils';

type PaginationProps<T = {}> = T & {
  pageSize: number | string;
} & RequireOnlyOne<{
    offset: number | string;
    pageNum: number | string;
  }>;

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
