import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { type ApiRequestProps } from '../../type/next';
import type { SortOrder } from '@fastgpt/global/core/train/rerank/api';

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
}

/**
 * Parse sort parameters from request
 *
 * @param req - API request
 * @param defaultField - Default sort field
 * @param defaultOrder - Default sort order
 * @param allowedFields - Allowed sort fields
 * @returns MongoDB sort object
 */
export function parseSortParams<T extends string>(
  req: ApiRequestProps,
  defaultField: T,
  defaultOrder: SortOrder = 'desc',
  allowedFields?: T[]
): Record<string, 1 | -1> {
  const { sortField = defaultField, sortOrder = defaultOrder } = Object.keys(req.body).includes(
    'sortField'
  )
    ? req.body
    : Object.keys(req.query).includes('sortField')
      ? req.query
      : {};

  // Validate field if allowedFields is provided
  if (allowedFields && !allowedFields.includes(sortField as T)) {
    throw new Error(`Invalid sort field: ${sortField}. Allowed: ${allowedFields.join(', ')}`);
  }

  // Validate order
  if (sortOrder !== 'asc' && sortOrder !== 'desc') {
    throw new Error(`Invalid sort order: ${sortOrder}. Must be 'asc' or 'desc'`);
  }

  return {
    [sortField]: sortOrder === 'asc' ? 1 : -1
  };
}
