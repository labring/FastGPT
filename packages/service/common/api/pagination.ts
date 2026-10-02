import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { NodeApiRequest } from '../../types/http';

/** 整组选取 body 或 query 中的分页参数，body 优先；省略 pageSize 时仍保留分页位置。 */
export const parsePaginationRequest = (req: NodeApiRequest) => {
  const paginationKeys = ['pageSize', 'pageNum', 'offset'];
  const {
    pageSize = 10,
    pageNum = 1,
    offset = 0
  } = Object.keys(req.body).some((key) => paginationKeys.includes(key))
    ? req.body
    : Object.keys(req.query).some((key) => paginationKeys.includes(key))
      ? req.query
      : {};
  if (!pageSize || (pageNum === undefined && offset === undefined)) {
    throw new Error(CommonErrEnum.missingParams);
  }
  return {
    pageSize: Number(pageSize),
    offset: offset ? Number(offset) : (Number(pageNum) - 1) * Number(pageSize)
  };
};
