import type {
  UsageCommonFilters,
  UsageFilterContext
} from '@fastgpt/global/support/wallet/usage/filter';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { Types } from '../../../../common/mongo';

export type UsageDepartment = {
  _id: string;
  path: string;
  pathId: string;
  name: string;
  avatar?: string;
};

export type ResolvedUsageScope =
  | { kind: 'self'; tmbId: string }
  | { kind: 'all' }
  | { kind: 'members'; ids: [string, ...string[]] }
  | { kind: 'none' };

export type UsageScopeResult = {
  scope: ResolvedUsageScope;
  context: UsageFilterContext;
  departments: UsageDepartment[];
  directoryId?: string;
};

/** 路径由 pathId 段组成；根组织覆盖整棵树，其他节点必须按完整段边界匹配。 */
export const isUsageDepartmentDescendant = (
  department: UsageDepartment,
  ancestor: UsageDepartment
) => {
  if (department._id === ancestor._id) return true;
  if (ancestor.path === '' && ancestor.pathId === '') return true;
  const prefix = `${ancestor.path}/${ancestor.pathId}`;
  return department.path === prefix || department.path.startsWith(`${prefix}/`);
};

/**
 * 展开已选部门列表为包含自身及全部下属子部门的部门 ID 集合。
 * UI 上父子部门独立勾选；查询时选中某个部门会覆盖其整棵子部门树，不存在的部门 ID 自动忽略。
 */
export const getUsageDepartmentSubtreeIds = ({
  departments,
  ids
}: {
  departments: UsageDepartment[];
  ids: string[];
}) => {
  const departmentMap = new Map(departments.map((item) => [item._id, item]));
  const selectedOrgs = ids.flatMap((id) => {
    const org = departmentMap.get(id);
    return org ? [org] : [];
  });
  const subtreeIds = new Set<string>();
  for (const department of departments) {
    if (selectedOrgs.some((ancestor) => isUsageDepartmentDescendant(department, ancestor))) {
      subtreeIds.add(department._id);
    }
  }
  return subtreeIds;
};

/** 三个读取端共用条件；显式构造 ObjectId，none 始终使用空 $in，绝不扩大为团队全部。 */
export const buildUsageMatch = ({
  teamId,
  scope,
  filters,
  legacy = false
}: {
  teamId: string;
  scope: ResolvedUsageScope;
  filters: UsageCommonFilters;
  legacy?: boolean;
}) => ({
  teamId: new Types.ObjectId(teamId),
  ...(scope.kind === 'self'
    ? { tmbId: new Types.ObjectId(scope.tmbId) }
    : scope.kind === 'all'
      ? {}
      : {
          tmbId: { $in: scope.kind === 'none' ? [] : scope.ids.map((id) => new Types.ObjectId(id)) }
        }),
  time: {
    $gte: new Date(filters.dateStart ?? 0),
    $lte: new Date(filters.dateEnd ?? Date.now())
  },
  ...(filters.sources?.length || (legacy && filters.sources !== undefined)
    ? { source: { $in: filters.sources } }
    : { source: { $exists: true } }),
  ...(filters.projectName
    ? {
        appName: { $regex: new RegExp(replaceRegChars(filters.projectName), 'i') }
      }
    : { appName: { $exists: true } })
});
