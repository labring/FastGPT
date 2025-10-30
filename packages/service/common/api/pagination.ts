import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { type ApiRequestProps } from '../../type/next';

export const parsePaginationRequest = (req: ApiRequestProps) => {
  const {
    pageSize = 10,
    pageNum = 1,
    offset = 0
  } = Object.keys(req.body).includes('pageSize')
    ? req.body
    : Object.keys(req.query).includes('pageSize')
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
