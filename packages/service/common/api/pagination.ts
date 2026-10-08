import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { NodeApiRequest } from '../../types/http';

/**
 * 整组选取 body 或 query 中的分页参数，body 优先。
 * 当请求省略 pageSize 时仍保留分页位置（offset 或 pageNum）；
 * 若同时提供 offset（包括 0）与 pageNum，优先按 offset 定位。
 */
export const parsePaginationRequest = (req: NodeApiRequest) => {
  const paginationKeys = ['pageSize', 'pageNum', 'offset'];
  const body = req.body || {};
  const query = req.query || {};
  const {
    pageSize = 10,
    pageNum = 1,
    offset
  } = Object.keys(body).some((key) => paginationKeys.includes(key))
    ? body
    : Object.keys(query).some((key) => paginationKeys.includes(key))
      ? query
      : {};
  if (!pageSize || (pageNum === undefined && offset === undefined)) {
    throw new Error(CommonErrEnum.missingParams);
  }
  return {
    pageSize: Number(pageSize),
    offset:
      offset !== undefined && offset !== ''
        ? Number(offset)
        : (Number(pageNum) - 1) * Number(pageSize)
  };
};
