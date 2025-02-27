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

type LinkedPaginationProps<T = {}> = T & {
  pageSize?: number;
  anchorId?: string;
  direction?: 'prev' | 'next';
};

type LinkedListResponse<T = {}> = {
  list: Array<T & { _id: string }>;
  hasMore: boolean;
};
