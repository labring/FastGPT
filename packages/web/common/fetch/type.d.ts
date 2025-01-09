import { RequireOnlyOne } from '@fastgpt/global/common/type/utils';

type PaginationProps<T = {}> = T & {
  pageSize: number | string;
} & RequireOnlyOne<{
    offset: number | string;
    pageNum: number | string;
  }>;

type PaginationResponse<T = any> = {
  total: number;
  list: T[];
};
