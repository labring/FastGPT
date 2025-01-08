import { RequireOnlyOne } from '@fastgpt/global/common/type/utils';

type PaginationProps<T = {}> = T & {
  pageSize: number | string;
} & RequireOnlyOne<{
    offset: number | string;
    pageNum: number | string;
  }>;

type PaginationResponse<T = {}> = {
  total: number;
  list: T[];
};

export type TokenPaginationProps = {
  pageToken: string;
  pageSize: number;
};

export type TokenPaginationResponse<T = any> = {
  nextPageToken: string;
  list: T[];
};
