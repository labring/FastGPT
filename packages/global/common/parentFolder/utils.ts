import { ParentIdType } from './type';

export const parseParentIdInMongo = (parentId: ParentIdType) => {
  if (parentId === undefined) return {};

  if (parentId === null || parentId === '')
    return {
      parentId: null
    };

  const pattern = /^[0-9a-fA-F]{24}$/;
  if (pattern.test(parentId))
    return {
      parentId
    };
  return {};
};
