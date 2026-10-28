import {
  createPaginationSchema,
  PaginationPageSizeSchema,
  type PaginationType
} from '@fastgpt/global/openapi/api';
import type { NodeApiRequest } from '../../types/http';
import { parseApiInput } from '../zod/requestParseError';

const PaginationRequestSchema = createPaginationSchema({
  pageSize: PaginationPageSizeSchema
});
const defaultPageSize = PaginationPageSizeSchema.parse(undefined);

/**
 * 将已通过 Schema 校验的分页参数归一为 pageSize 和 offset。
 * 保留业务 Schema 补齐的每页条数；offset（包括 0）优先于页码。
 * 此处不重复校验入参，HTTP 边界仍由 parseApiInput 或 parsePaginationRequest 负责。
 */
export const normalizePagination = ({
  pageSize = defaultPageSize,
  pageNum = 1,
  offset
}: Pick<PaginationType, 'pageSize' | 'pageNum' | 'offset'>) => ({
  pageSize,
  offset: offset ?? (pageNum - 1) * pageSize
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
  const pagination = fromBody
    ? parseApiInput({ req: input, bodySchema: PaginationRequestSchema }).body
    : parseApiInput({ req: input, querySchema: PaginationRequestSchema }).query;
  return normalizePagination(pagination);
};
