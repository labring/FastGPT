export type PaginationProps<T = {}> = T & {
  current: number;
  pageSize: number;
};
export type PaginationResponse<T = any> = {
  total: number;
  list: T[];
};
