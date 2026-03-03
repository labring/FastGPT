import type { PaginationProps, PaginationResponseType } from '@fastgpt/global/openapi/api';
export type { PaginationProps, PaginationResponseType as PaginationResponse };

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
