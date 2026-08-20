export type PageParams = {
  page: number;
  pageSize: number;
};

export type PageResult<T> = {
  total: number;
  list: T[];
};

export type NormalizedPageParams = {
  skip: number;
  limit: number;
};

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

/**
 * 将 1-based 分页参数归一化为 skip/limit。
 * 非法或缺失的 page/pageSize 回退默认值，pageSize 超过 maxPageSize 时截断。
 */
export function normalizePageParams(
  params: PageParams,
  opts: { defaultPageSize?: number; maxPageSize?: number } = {}
): NormalizedPageParams {
  const defaultPageSize = opts.defaultPageSize ?? DEFAULT_PAGE_SIZE;
  const maxPageSize = opts.maxPageSize ?? MAX_PAGE_SIZE;

  const page = Number.isInteger(params.page) && params.page > 0 ? params.page : 1;
  const pageSize =
    Number.isInteger(params.pageSize) && params.pageSize > 0 ? params.pageSize : defaultPageSize;
  const limit = Math.min(pageSize, maxPageSize);

  return {
    skip: (page - 1) * limit,
    limit
  };
}
