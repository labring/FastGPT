import {
  UsageFilterContextSchema,
  type UsageSubjectFilter,
  type UsageFilterOption
} from '@fastgpt/global/support/wallet/usage/filter';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { getTeamMemberMap } from '../../../user/team/utils';
import { formatSourceMember } from '../../../user/utils';
import { getLogger, LogCategories } from '../../../../common/logger';
import type { ResolvedUsageScope, UsageScopeResult } from './type';
import {
  findUsageGroupsByIds,
  findUsageGroupMembers,
  findUsageDepartments,
  findUsageDepartmentMembers,
  findUsageMemberOptions,
  findUsageGroupOptions,
  findUsageTeam
} from './entity';
import {
  getUsageDepartmentSelection,
  createUsageDepartmentTree,
  isUsageDepartmentDescendant,
  normalizeUsageDepartmentRules,
  toggleUsageDepartment
} from './utils';

export type ResolveUsageScopeParams = {
  teamId: string;
  tmbId: string;
  canManageMembers: boolean;
  subjectFilter: UsageSubjectFilter;
  expectedScope?: 'team' | 'self';
  requestKey: string;
  departmentAction?: { orgId: string; directoryId?: string };
  visibleDepartmentIds?: string[];
  /** 仅浏览目录时传入；普通查询不因隐藏目录失效而清空其他有效选择。 */
  departmentDirectoryId?: string;
  operation?: 'query' | 'options' | 'validate' | 'export' | 'legacy';
};

/** 每次操作读取主库的当前关系和资料；普通成员在读取任何团队选项前收敛到本人。 */
export const resolveUsageScope = async ({
  teamId,
  tmbId,
  canManageMembers,
  subjectFilter: requestedFilter,
  expectedScope,
  requestKey,
  departmentAction,
  visibleDepartmentIds,
  departmentDirectoryId,
  operation = 'query'
}: ResolveUsageScopeParams): Promise<UsageScopeResult> => {
  const started = Date.now();
  const logger = getLogger(LogCategories.MODULE.WALLET);
  const selectedCount =
    requestedFilter.type === 'department'
      ? requestedFilter.rules.filter((rule) => rule.include).length
      : requestedFilter.ids.length;
  /** 只记录规模与规范化原因，不记录名称、成员名单或导出内容。 */
  const complete = (result: UsageScopeResult) => {
    logger.debug('Usage scope resolved', {
      operation,
      requestKey,
      elapsedMs: Date.now() - started,
      selectedCount,
      scope: result.scope.kind,
      memberCount:
        result.scope.kind === 'members'
          ? result.scope.ids.length
          : result.scope.kind === 'self'
            ? 1
            : result.scope.kind === 'none'
              ? 0
              : undefined,
      reasons: result.context.notices
    });
    return result;
  };
  try {
    const scopeChanged =
      expectedScope !== undefined && expectedScope !== (canManageMembers ? 'team' : 'self');
    const context = UsageFilterContextSchema.parse({
      requestKey,
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
      return complete({ scope: { kind: 'self', tmbId }, context, departments: [] });
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
        subjectFilter.ids.length === 0
          ? { kind: 'all' }
          : ids.length
            ? { kind: 'members', ids: ids as [string, ...string[]] }
            : { kind: 'none' };
      return complete({ scope, context, departments: [] });
    }

    if (subjectFilter.type === 'group') {
      const groups = await findUsageGroupsByIds({ teamId, ids: subjectFilter.ids });
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
          const ids = [...members.keys()];
          return ids.length
            ? { kind: 'members', ids: ids as [string, ...string[]] }
            : { kind: 'none' };
        }
        // 关系表没有 teamId，必须先验证群组，再对成员求本团队交集。
        const relations = await findUsageGroupMembers(ids);
        return memberScope([...new Set(relations.map((item) => String(item.tmbId)))]);
      })();
      return complete({ scope, context, departments: [] });
    }

    const departments = (await findUsageDepartments(teamId)).map((item) => ({
      ...item,
      _id: String(item._id)
    }));
    const tree = createUsageDepartmentTree(departments);
    // 目录、点框及可见节点不属于 subjectFilter，也须与数据库的规范 ID 一致。
    const directoryId = (departmentDirectoryId ?? departmentAction?.directoryId)?.toLowerCase();
    const actionOrgId = departmentAction?.orgId.toLowerCase();
    const visibleIds = visibleDepartmentIds?.map((id) => id.toLowerCase());
    const pathReset =
      directoryId !== undefined && directoryId !== '' && !tree.byId.has(directoryId);
    const rules = (() => {
      if (pathReset) {
        context.notices.push('ORG_PATH_RESET');
        context.selectionChanged = true;
        context.resetPagination = true;
        return [];
      }
      const invalid = subjectFilter.rules.some((rule) => !tree.byId.has(rule.orgId));
      const invalidAction = actionOrgId !== undefined && !tree.byId.has(actionOrgId);
      if (invalid || invalidAction) {
        context.notices.push('DEPARTMENT_INVALID');
        context.selectionChanged = true;
        context.resetPagination = true;
      }
      const normalized = normalizeUsageDepartmentRules({
        departments,
        rules: subjectFilter.rules,
        tree
      });
      return actionOrgId !== undefined && !invalidAction
        ? toggleUsageDepartment({ departments, rules: normalized, orgId: actionOrgId, tree })
        : normalized;
    })();
    const { selected, states } = getUsageDepartmentSelection({ departments, rules, tree });
    const stateMap = new Map(states.map((state) => [state.orgId, state.state]));
    const visibleIdSet = visibleIds ? new Set(visibleIds) : undefined;
    context.subjectFilter = { type: 'department', rules };
    context.departmentCheckStates = visibleIdSet
      ? states.filter((state) => visibleIdSet.has(state.orgId))
      : states;
    context.selectedItems = rules
      .filter((rule) => rule.include)
      .map((rule) => {
        const department = tree.byId.get(rule.orgId)!.department!;
        return {
          id: rule.orgId,
          ...formatSourceMember(department),
          partial: stateMap.get(rule.orgId) === 'partial'
        };
      });
    if (rules.length === 0) {
      return complete({
        scope: { kind: 'all' },
        context,
        departments,
        directoryId: pathReset ? '' : directoryId
      });
    }
    const relations = await findUsageDepartmentMembers({ teamId, orgIds: [...selected] });
    return complete({
      scope: await memberScope([...new Set(relations.map((item) => String(item.tmbId)))]),
      context,
      departments,
      directoryId: pathReset ? '' : directoryId
    });
  } catch (error) {
    logger.warn('Usage scope resolution failed', {
      operation,
      requestKey,
      selectedCount,
      elapsedMs: Date.now() - started,
      failureCategory: error instanceof Error ? error.name : 'unknown'
    });
    throw error;
  }
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
  /** 上层按请求语言提供展示名称，仅用于选项搜索，不影响群组范围解析。 */
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
  const regex = new RegExp(replaceRegChars(searchKey), 'i');
  if (context.subjectFilter.type === 'member') {
    const { members, total } = await findUsageMemberOptions({
      teamId,
      name: searchKey ? regex : undefined,
      offset,
      pageSize
    });
    return {
      ...empty,
      total,
      hasMore: offset + members.length < total,
      options: members.map((item) => ({ id: String(item._id), ...formatSourceMember(item) }))
    };
  }
  if (context.subjectFilter.type === 'group') {
    // 默认群组保存内部标识，展示名称匹配必须在数据库分页和计数之前合入。
    const { groups, total } = await findUsageGroupOptions({
      teamId,
      name: searchKey
        ? regex.test(defaultGroupName)
          ? { $in: [regex, DefaultGroupName] }
          : regex
        : undefined,
      offset,
      pageSize
    });
    return {
      ...empty,
      total,
      hasMore: offset + groups.length < total,
      options: groups.map((item) => ({
        id: String(item._id),
        ...formatSourceMember(item),
        isDefault: item.name === DefaultGroupName
      }))
    };
  }

  const team = await findUsageTeam(teamId);
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
      return searchKey
        ? regex.test(item.name) && (!directory || isUsageDepartmentDescendant(item, directory))
        : item.path === childrenPath;
    })
    .sort((a, b) => a._id.localeCompare(b._id));
  const options: UsageFilterOption[] = matches.slice(offset, offset + pageSize).map((item) => ({
    id: item._id,
    ...formatSourceMember(item),
    hasChildren: departments.some((child) => child.path === `${item.path}/${item.pathId}`),
    path: departments
      .filter((parent) => parent._id !== root?._id && isUsageDepartmentDescendant(item, parent))
      .sort((a, b) => a.path.length - b.path.length)
      .map((parent) => ({ id: parent._id, name: parent.name }))
  }));
  return {
    ...empty,
    options,
    total: matches.length,
    hasMore: offset + options.length < matches.length,
    departmentDirectory: {
      id: directoryId ?? '',
      name: directoryId ? (directory?.name ?? 'Team') : (team?.name ?? 'Team')
    },
    breadcrumbs: [{ id: '', name: team?.name ?? 'Team' }, ...path]
  };
};
