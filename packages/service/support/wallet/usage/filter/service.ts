import {
  UsageFilterContextSchema,
  type UsageSubjectFilter,
  type UsageFilterOption
} from '@fastgpt/global/support/wallet/usage/filter';
import type { TeamMemberSchema } from '@fastgpt/global/support/user/team/type';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { MongoOrgModel } from '../../../permission/org/orgSchema';
import { MongoOrgMemberModel } from '../../../permission/org/orgMemberSchema';
import { MongoMemberGroupModel } from '../../../permission/memberGroup/memberGroupSchema';
import { MongoGroupMemberModel } from '../../../permission/memberGroup/groupMemberSchema';
import { MongoTeamMember } from '../../../user/team/teamMemberSchema';
import { MongoTeam } from '../../../user/team/teamSchema';
import { Types } from '../../../../common/mongo';
import { getTeamMemberMap } from '../../../user/team/utils';
import { formatSourceMember } from '../../../user/utils';
import {
  getUsageDepartmentSubtreeIds,
  isUsageDepartmentDescendant,
  type ResolvedUsageScope,
  type UsageScopeResult
} from './utils';

export type ResolveUsageScopeParams = {
  teamId: string;
  tmbId: string;
  canManageMembers: boolean;
  subjectFilter?: UsageSubjectFilter;
  teamMemberIds?: string[];
  expectedScope?: 'team' | 'self';
  departmentDirectoryId?: string;
};

/** 每次操作读取主库的当前关系和资料；普通成员在读取任何团队选项前收敛到本人。 */
export const resolveUsageScope = async ({
  teamId,
  tmbId,
  canManageMembers,
  subjectFilter: rawSubjectFilter,
  teamMemberIds,
  expectedScope,
  departmentDirectoryId
}: ResolveUsageScopeParams): Promise<UsageScopeResult> => {
  const requestedFilter: UsageSubjectFilter = rawSubjectFilter ?? {
    type: 'member',
    ids: teamMemberIds ?? []
  };
  const scopeChanged =
    expectedScope !== undefined && expectedScope !== (canManageMembers ? 'team' : 'self');
  const context = UsageFilterContextSchema.parse({
    canManageMembers,
    scope: canManageMembers ? 'team' : 'self',
    subjectFilter: canManageMembers ? requestedFilter : { type: 'member', ids: [] },
    selectedItems: [],
    notices: scopeChanged ? ['PERMISSION_CHANGED'] : [],
    selectionChanged: false,
    scopeChanged,
    resetPagination: scopeChanged
  });
  if (!canManageMembers) {
    return { scope: { kind: 'self', tmbId }, context, departments: [] };
  }
  const subjectFilter = context.subjectFilter;

  /** 先按团队交集确认关系中的成员，防止脏数据或跨团队关系扩大范围。 */
  const memberScope = async (ids: string[]): Promise<ResolvedUsageScope> => {
    if (ids.length === 0) return { kind: 'none' };
    const members = await getTeamMemberMap({ teamId, memberIds: ids, fields: '_id' });
    const memberIds = [...members.keys()];
    return memberIds.length
      ? { kind: 'members', ids: memberIds as [string, ...string[]] }
      : { kind: 'none' };
  };

  if (subjectFilter.type === 'member') {
    const members = await getTeamMemberMap({
      teamId,
      memberIds: subjectFilter.ids,
      fields: '_id name avatar status'
    });
    context.selectedItems = subjectFilter.ids.map((id) => {
      const member = members.get(id);
      return {
        id,
        ...formatSourceMember(member ?? { name: 'unknown', status: TeamMemberStatusEnum.leave }),
        ...(!member ? { unavailable: true } : {})
      };
    });
    const ids = [...members.keys()];
    const scope: ResolvedUsageScope =
      rawSubjectFilter === undefined && teamMemberIds?.length === 0
        ? { kind: 'none' }
        : subjectFilter.ids.length === 0
          ? { kind: 'all' }
          : ids.length
            ? { kind: 'members', ids: ids as [string, ...string[]] }
            : { kind: 'none' };
    return { scope, context, departments: [] };
  }

  if (subjectFilter.type === 'group') {
    if (subjectFilter.ids.length === 0) {
      return { scope: { kind: 'all' }, context, departments: [] };
    }
    const groups = await MongoMemberGroupModel.find({
      teamId,
      _id: { $in: subjectFilter.ids }
    })
      .read('primary')
      .lean();
    const map = new Map(groups.map((group) => [String(group._id), group]));
    const ids = subjectFilter.ids.filter((id) => map.has(id));
    if (ids.length !== subjectFilter.ids.length) {
      context.notices.push('GROUP_INVALID');
      context.selectionChanged = true;
      context.resetPagination = true;
    }
    context.subjectFilter = { type: 'group', ids };
    context.selectedItems = ids.map((id) => {
      const group = map.get(id)!;
      return {
        id,
        ...formatSourceMember(group),
        isDefault: group.name === DefaultGroupName
      };
    });
    const scope = await (async (): Promise<ResolvedUsageScope> => {
      if (!ids.length) return { kind: 'all' };
      if (groups.some((group) => group.name === DefaultGroupName)) {
        const members = await getTeamMemberMap({ teamId, fields: '_id' });
        const allIds = [...members.keys()];
        return allIds.length
          ? { kind: 'members', ids: allIds as [string, ...string[]] }
          : { kind: 'none' };
      }
      const relations = await MongoGroupMemberModel.find({ groupId: { $in: ids } })
        .select('tmbId')
        .read('primary')
        .lean();
      return memberScope([...new Set(relations.map((item) => String(item.tmbId)))]);
    })();
    return { scope, context, departments: [] };
  }

  // 1. 读取当前团队全部部门，并校验浏览目录与已选部门有效性。
  const rawDepartments = await MongoOrgModel.find({ teamId })
    .select('_id path pathId name avatar')
    .read('primary')
    .lean();
  const departments = rawDepartments.map((item) => ({ ...item, _id: String(item._id) }));
  const departmentMap = new Map(departments.map((item) => [item._id, item]));
  const directoryId = departmentDirectoryId?.toLowerCase();
  const pathReset =
    directoryId !== undefined && directoryId !== '' && !departmentMap.has(directoryId);
  const ids = (() => {
    if (pathReset) {
      context.notices.push('ORG_PATH_RESET');
      context.selectionChanged = true;
      context.resetPagination = true;
      return [];
    }
    const validIds = subjectFilter.ids.filter((id) => departmentMap.has(id));
    if (validIds.length !== subjectFilter.ids.length) {
      context.notices.push('DEPARTMENT_INVALID');
      context.selectionChanged = true;
      context.resetPagination = true;
    }
    return validIds;
  })();

  // 2. 回填已选部门展示资料；未勾选任何有效部门时回到全团队范围。
  context.subjectFilter = { type: 'department', ids };
  context.selectedItems = ids.map((id) => ({
    id,
    ...formatSourceMember(departmentMap.get(id)!)
  }));
  const nextDirectoryId = pathReset ? '' : directoryId;
  if (ids.length === 0) {
    return {
      scope: { kind: 'all' },
      context,
      departments,
      directoryId: nextDirectoryId
    };
  }

  // 3. 将所选部门展开为包含下属子部门的完整集合，再按团队交集解析成员范围。
  const subtreeIds = getUsageDepartmentSubtreeIds({ departments, ids });
  const relations = await MongoOrgMemberModel.find({ teamId, orgId: { $in: [...subtreeIds] } })
    .select('tmbId')
    .read('primary')
    .lean();
  return {
    scope: await memberScope([...new Set(relations.map((item) => String(item.tmbId)))]),
    context,
    departments,
    directoryId: nextDirectoryId
  };
};

/** 分页选项只读，不调用创建根组织或默认群组的管理函数；已选资料由解析器独立回填。 */
export const getUsageFilterOptions = async ({
  result,
  teamId,
  searchKey = '',
  defaultGroupName = DefaultGroupName,
  offset,
  pageSize
}: {
  result: UsageScopeResult;
  teamId: string;
  searchKey?: string;
  defaultGroupName?: string;
  offset: number;
  pageSize: number;
}) => {
  const { context, departments, directoryId } = result;
  const empty = {
    context,
    options: [] as UsageFilterOption[],
    total: 0,
    hasMore: false,
    breadcrumbs: [] as { id: string; name: string }[]
  };
  if (!context.canManageMembers) return empty;
  const effectiveSearchKey = context.notices.includes('ORG_PATH_RESET') ? '' : searchKey;
  const effectiveOffset = context.notices.includes('ORG_PATH_RESET') ? 0 : offset;
  const regex = new RegExp(replaceRegChars(effectiveSearchKey), 'i');

  if (context.subjectFilter.type === 'member') {
    const where = {
      teamId: new Types.ObjectId(teamId),
      ...(effectiveSearchKey ? { name: regex } : {})
    };
    const [members, total] = await Promise.all([
      MongoTeamMember.aggregate<TeamMemberSchema>([
        { $match: where },
        {
          $addFields: {
            statusOrder: {
              $switch: {
                branches: [
                  { case: { $eq: ['$status', 'active'] }, then: 1 },
                  { case: { $eq: ['$status', 'leave'] }, then: 2 },
                  { case: { $eq: ['$status', 'forbidden'] }, then: 3 }
                ],
                default: 4
              }
            }
          }
        },
        { $sort: { statusOrder: 1, _id: 1 } },
        { $skip: effectiveOffset },
        { $limit: pageSize }
      ]).read('primary'),
      MongoTeamMember.countDocuments(where).read('primary')
    ]);
    return {
      ...empty,
      total,
      hasMore: effectiveOffset + members.length < total,
      options: members.map((item) => ({ id: String(item._id), ...formatSourceMember(item) }))
    };
  }

  if (context.subjectFilter.type === 'group') {
    const where = {
      teamId,
      ...(effectiveSearchKey
        ? {
            name: regex.test(defaultGroupName) ? { $in: [regex, DefaultGroupName] } : regex
          }
        : {})
    };
    const [groups, total] = await Promise.all([
      MongoMemberGroupModel.find(where)
        .sort({ _id: 1 })
        .skip(effectiveOffset)
        .limit(pageSize)
        .read('primary')
        .lean(),
      MongoMemberGroupModel.countDocuments(where).read('primary')
    ]);
    return {
      ...empty,
      total,
      hasMore: effectiveOffset + groups.length < total,
      options: groups.map((item) => ({
        id: String(item._id),
        ...formatSourceMember(item),
        isDefault: item.name === DefaultGroupName
      }))
    };
  }

  const team = await MongoTeam.findById(teamId).select('name').read('primary').lean();
  const root = departments.find((item) => item.path === '');
  const directory = directoryId ? departments.find((item) => item._id === directoryId) : root;
  const path = directory
    ? departments
        .filter((item) => item._id !== root?._id && isUsageDepartmentDescendant(directory, item))
        .sort((a, b) => a.path.length - b.path.length)
        .map((item) => ({ id: item._id, name: item.name }))
    : [];
  const childrenPath = directory
    ? directory.path === '' && directory.pathId === ''
      ? ''
      : `${directory.path}/${directory.pathId}`
    : '';
  const matches = departments
    .filter((item) => {
      if (item._id === root?._id) return false;
      return effectiveSearchKey
        ? regex.test(item.name) && (!directory || isUsageDepartmentDescendant(item, directory))
        : item.path === childrenPath;
    })
    .sort((a, b) => a._id.localeCompare(b._id));
  const options: UsageFilterOption[] = matches
    .slice(effectiveOffset, effectiveOffset + pageSize)
    .map((item) => ({
      id: item._id,
      ...formatSourceMember(item),
      hasChildren: departments.some((child) => child.path === `${item.path}/${item.pathId}`)
    }));
  return {
    ...empty,
    options,
    total: matches.length,
    hasMore: effectiveOffset + options.length < matches.length,
    departmentDirectory: {
      id: directoryId ?? '',
      name: directoryId ? (directory?.name ?? 'Team') : (team?.name ?? 'Team')
    },
    breadcrumbs: [{ id: '', name: team?.name ?? 'Team' }, ...path]
  };
};
