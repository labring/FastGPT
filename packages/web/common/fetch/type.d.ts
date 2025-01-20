import { RequireOnlyOne } from '@fastgpt/global/common/type/utils';

type PaginationProps<T = {}> = T & {
  pageSize: number | string;
  metaData?: Record<string, any>;
} & RequireOnlyOne<{
    offset: number | string;
    pageNum: number | string;
  }>;

type PaginationResponse<T = {}> = {
  total: number;
  list: T[];
  metaData?: Record<string, any>;
};
