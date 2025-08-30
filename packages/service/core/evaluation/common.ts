import { Types } from 'mongoose';
import { parseHeaderCert } from '../../support/permission/controller';
import type { AuthModeType } from '../../support/permission/type';
export const validateResourceAccess = async (
  resourceId: string,
  auth: AuthModeType,
  resourceName: string = 'Resource'
) => {
  const { teamId } = await parseHeaderCert(auth);
  return {
    teamId,
    resourceFilter: {
      _id: new Types.ObjectId(resourceId),
      teamId
    },
    notFoundError: `${resourceName} not found`
  };
};
export const validateResourcesAccess = async (
  resourceIds: string[],
  auth: AuthModeType,
  resourceName: string = 'Resource'
) => {
  const { teamId } = await parseHeaderCert(auth);
  return {
    teamId,
    resourceFilter: {
      _id: { $in: resourceIds.map((id) => new Types.ObjectId(id)) },
      teamId
    },
    notFoundError: `${resourceName} not found`
  };
};
export const validateResourceCreate = async (auth: AuthModeType) => {
  const { teamId, tmbId } = await parseHeaderCert(auth);
  return { teamId, tmbId };
};
export const buildListQuery = (
  teamId: string,
  searchKey?: string,
  searchFields: string[] = ['name', 'description']
): any => {
  const filter: any = { teamId: new Types.ObjectId(teamId) };

  if (searchKey) {
    filter.$or = searchFields.map((field) => ({
      [field]: { $regex: searchKey, $options: 'i' }
    }));
  }

  return filter;
};
export const validateListAccess = async (
  auth: AuthModeType,
  searchKey?: string,
  page: number = 1,
  pageSize: number = 20
) => {
  const { teamId } = await parseHeaderCert(auth);
  const filter = buildListQuery(teamId, searchKey);
  const { skip, limit, sort } = buildPaginationOptions(page, pageSize);

  return { teamId, filter, skip, limit, sort };
};
export const buildPaginationOptions = (page: number = 1, pageSize: number = 20) => ({
  skip: (page - 1) * pageSize,
  limit: pageSize,
  sort: { createTime: -1 as const }
});
export const checkUpdateResult = (result: any, resourceName: string = 'Resource') => {
  if (result.matchedCount === 0) {
    throw new Error(`${resourceName} not found`);
  }
};

export const checkDeleteResult = (result: any, resourceName: string = 'Resource') => {
  if (result.deletedCount === 0) {
    throw new Error(`${resourceName} not found`);
  }
};
