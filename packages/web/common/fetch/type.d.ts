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

type LinkedPaginationProps<T = {}> = T & {
  pageSize: number;
} & RequireOnlyOne<{
    initialId: string;
    nextId: string;
    prevId: string;
  }> &
  RequireOnlyOne<{
    initialIndex: number;
    nextIndex: number;
    prevIndex: number;
  }>;

type LinkedListResponse<T = {}> = {
  list: Array<T & { _id: string; index: number }>;
  hasMorePrev: boolean;
  hasMoreNext: boolean;
};
