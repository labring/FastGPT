import { createPaginationSchema, PaginationPageSizeSchema } from '@fastgpt/global/openapi/api';
import type { NodeApiRequest } from '../../types/http';
import { parseApiInput } from '../zod/requestParseError';

const PaginationRequestSchema = createPaginationSchema({
  pageSize: PaginationPageSizeSchema
});

/**
 * 整组选取 body 或 query 中的分页参数，body 优先。
 * 当请求省略 pageSize 时仍保留分页位置（offset 或 pageNum）；
 * 若同时提供 offset（包括 0）与 pageNum，优先按 offset 定位。
 * pageSize 超过统一上限时自动截断，格式不正确时按入参错误返回 400。
 * 按统一的二选一 Schema 校验并过滤非选中定位字段，无效参数按入参错误返回 400。
 */
export const parsePaginationRequest = (req: NodeApiRequest) => {
  const paginationKeys = ['pageSize', 'pageNum', 'offset'];
  const body = req.body || {};
  const query = req.query || {};
  const fromBody = Object.keys(body).some((key) => paginationKeys.includes(key));
  const input = { body, query };
  const {
    pageSize,
    pageNum = 1,
    offset
  } = fromBody
    ? parseApiInput({ req: input, bodySchema: PaginationRequestSchema }).body
    : parseApiInput({ req: input, querySchema: PaginationRequestSchema }).query;
  return {
    pageSize,
    offset: offset ?? (pageNum - 1) * pageSize
  };
};
