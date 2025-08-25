import { Types } from 'mongoose';
import { parseHeaderCert } from '../../support/permission/controller';
import type { AuthModeType } from '../../support/permission/type';

// 通用的资源访问权限验证
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

// 通用的批量资源访问权限验证
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

// 通用的资源创建权限验证
export const validateResourceCreate = async (auth: AuthModeType) => {
  const { teamId, tmbId } = await parseHeaderCert(auth);
  return { teamId, tmbId };
};

// 通用的列表查询构建
export const buildListQuery = (
  teamId: string,
  searchKey?: string,
  searchFields: string[] = ['name', 'description']
): any => {
  const filter: any = { teamId: new Types.ObjectId(teamId) }; // 转换为ObjectId

  if (searchKey) {
    filter.$or = searchFields.map((field) => ({
      [field]: { $regex: searchKey, $options: 'i' }
    }));
  }

  return filter;
};

// 专门为列表方法设计的认证和查询构建
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

// 通用的分页参数处理
export const buildPaginationOptions = (page: number = 1, pageSize: number = 20) => ({
  skip: (page - 1) * pageSize,
  limit: pageSize,
  sort: { createTime: -1 as const }
});

// 通用的更新结果检查
export const checkUpdateResult = (result: any, resourceName: string = 'Resource') => {
  if (result.matchedCount === 0) {
    throw new Error(`${resourceName} not found`);
  }
};

// 通用的删除结果检查
export const checkDeleteResult = (result: any, resourceName: string = 'Resource') => {
  if (result.deletedCount === 0) {
    throw new Error(`${resourceName} not found`);
  }
};
