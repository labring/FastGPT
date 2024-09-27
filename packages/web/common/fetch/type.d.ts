export type PaginationProps<T = {}> = T & {
  offset: number;
  pageSize: number;
};
export type PaginationResponse<T = any> = {
  total: number;
  list: T[];
};
