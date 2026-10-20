import { PaginationPageSizeSchema, PaginationSchema } from '@fastgpt/global/openapi/api';
import type { NodeApiRequest } from '../../types/http';
import { parseApiInput } from '../zod/requestParseError';

const PaginationPageSizeRequestSchema = PaginationSchema.pick({ pageSize: true }).extend({
  pageSize: PaginationPageSizeSchema.default(10)
});

/**
 * 整组选取 body 或 query 中的分页参数，body 优先。
 * 当请求省略 pageSize 时仍保留分页位置（offset 或 pageNum）；
 * 若同时提供 offset（包括 0）与 pageNum，优先按 offset 定位。
 * pageSize 使用统一的 API 入参校验，超限或格式不正确时按入参错误返回 400。
 */
export const parsePaginationRequest = (req: NodeApiRequest) => {
  const paginationKeys = ['pageSize', 'pageNum', 'offset'];
  const body = req.body || {};
  const query = req.query || {};
  const fromBody = Object.keys(body).some((key) => paginationKeys.includes(key));
  // 只校验条数，保留旧接口的 offset/pageNum 选取与转换行为；空入参继续使用默认值。
  const input = { body, query };
  const pageSize = fromBody
    ? parseApiInput({ req: input, bodySchema: PaginationPageSizeRequestSchema }).body.pageSize
    : parseApiInput({ req: input, querySchema: PaginationPageSizeRequestSchema }).query.pageSize;
  const { pageNum = 1, offset } = fromBody ? body : query;
  return {
    pageSize,
    offset:
      offset !== undefined && offset !== ''
        ? Number(offset)
        : (Number(pageNum) - 1) * Number(pageSize)
  };
};
