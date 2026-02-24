import type { RequireOnlyOne } from '@fastgpt/global/common/type/utils';

export type PaginationProps<T = {}> = T & {
  pageSize: number | string;
} & RequireOnlyOne<{
    offset: number | string;
    pageNum: number | string;
  }>;

export type PaginationResponse<T = {}> = {
  total: number;
  list: T[];
};

export type LinkedPaginationProps<T = {}, A = any> = T & {
  pageSize: number;
  anchor?: A;
  initialId?: string;
  nextId?: string;
  prevId?: string;
};

export type LinkedListResponse<T = {}, A = any> = {
  list: Array<T & { id: string; anchor?: A }>;
  hasMorePrev: boolean;
  hasMoreNext: boolean;
};
