import type { RequireOnlyOne } from '@fastgpt/global/common/type/utils';

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

type LinkedPaginationProps<T = {}, A = any> = T & {
  pageSize: number;
  anchor?: A;
  initialId?: string;
  nextId?: string;
  prevId?: string;
};

type LinkedListResponse<T = {}, A = any> = {
  list: Array<T & { id: string; anchor?: A }>;
  hasMorePrev: boolean;
  hasMoreNext: boolean;
};
