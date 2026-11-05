import type {
  UsageCommonFilters,
  UsageDepartmentRule
} from '@fastgpt/global/support/wallet/usage/filter';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { Types } from '../../../../common/mongo';
import type { ResolvedUsageScope, UsageDepartment } from './type';

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

/** 按完整路径段建树；缺失的中间部门保留路径节点，同一请求可复用索引。 */
export const createUsageDepartmentTree = (departments: UsageDepartment[]) => {
  type Node = {
    department?: UsageDepartment;
    parent?: Node;
    children: Map<string, Node>;
  };
  const root: Node = { children: new Map() };
  const nodes = [root];
  const byId = new Map<string, Node>();
  for (const department of departments) {
    let node = root;
    for (const segment of `${department.path}/${department.pathId}`.split('/').filter(Boolean)) {
      let child = node.children.get(segment);
      if (!child) {
        child = { parent: node, children: new Map() };
        node.children.set(segment, child);
        // 创建顺序保证父节点在前，无需递归或排序。
        nodes.push(child);
      }
      node = child;
    }
    node.department = department;
    byId.set(department._id, node);
  }
  return { nodes, byId };
};

/** 前向继承最近祖先规则、反向汇总子树三态；父部门自身也是独立覆盖位置。 */
export const getUsageDepartmentSelection = ({
  departments,
  rules,
  tree = createUsageDepartmentTree(departments)
}: {
  departments: UsageDepartment[];
  rules: UsageDepartmentRule[];
  tree?: ReturnType<typeof createUsageDepartmentTree>;
}) => {
  const ruleMap = new Map(rules.map((rule) => [rule.orgId, rule.include]));
  const counts = new Map<
    (typeof tree.nodes)[number],
    { include: boolean; selected: number; total: number }
  >();
  for (const node of tree.nodes) {
    const include =
      (node.department ? ruleMap.get(node.department._id) : undefined) ??
      (node.parent ? counts.get(node.parent)?.include : false) ??
      false;
    counts.set(node, {
      include,
      selected: node.department && include ? 1 : 0,
      total: node.department ? 1 : 0
    });
  }
  for (let index = tree.nodes.length - 1; index > 0; index--) {
    const node = tree.nodes[index];
    const count = counts.get(node)!;
    const parent = counts.get(node.parent!)!;
    parent.selected += count.selected;
    parent.total += count.total;
  }
  // 输出保持原部门顺序，不受路径节点创建顺序影响。
  const selected = new Set(
    departments
      .filter((department) => counts.get(tree.byId.get(department._id)!)!.include)
      .map((department) => department._id)
  );
  const states = departments.map((department) => {
    const count = counts.get(tree.byId.get(department._id)!)!;
    return {
      orgId: department._id,
      state:
        count.selected === 0
          ? ('none' as const)
          : count.selected === count.total
            ? ('all' as const)
            : ('partial' as const)
    };
  });
  return { selected, states };
};

/** 移除不存在及没有包含祖先的排除项；不折叠用户逐个选中的子部门标签。 */
export const normalizeUsageDepartmentRules = ({
  departments,
  rules,
  tree = createUsageDepartmentTree(departments)
}: {
  departments: UsageDepartment[];
  rules: UsageDepartmentRule[];
  tree?: ReturnType<typeof createUsageDepartmentTree>;
}) => {
  const includedIds = new Set(rules.filter((rule) => rule.include).map((rule) => rule.orgId));
  const covered = new Set<(typeof tree.nodes)[number]>();
  for (const node of tree.nodes) {
    if (
      (node.parent && covered.has(node.parent)) ||
      (node.department && includedIds.has(node.department._id))
    ) {
      covered.add(node);
    }
  }
  return rules.filter((rule) => {
    const node = tree.byId.get(rule.orgId);
    return node && (rule.include || (node.parent && covered.has(node.parent)));
  });
};

/** 点框命令覆盖目标子树；全选时保留外部祖先的排除例外，半选时补齐整个子树。 */
export const toggleUsageDepartment = ({
  departments,
  rules,
  orgId,
  tree = createUsageDepartmentTree(departments)
}: {
  departments: UsageDepartment[];
  rules: UsageDepartmentRule[];
  orgId: string;
  tree?: ReturnType<typeof createUsageDepartmentTree>;
}) => {
  const targetNode = tree.byId.get(orgId);
  if (!targetNode?.department) return rules;
  const target = targetNode.department;
  const state = getUsageDepartmentSelection({ departments, rules, tree }).states.find(
    (item) => item.orgId === orgId
  )?.state;
  const remaining = rules.filter((rule) => {
    const department = tree.byId.get(rule.orgId)?.department;
    return department && !isUsageDepartmentDescendant(department, target);
  });
  if (state !== 'all') return [...remaining, { orgId, include: true }];
  // 目标子树移除后只会继承外部最近祖先，不必再次计算整棵树。
  const ruleMap = new Map(remaining.map((rule) => [rule.orgId, rule.include]));
  const inherited = (() => {
    for (let node = targetNode.parent; node; node = node.parent) {
      const include = node.department ? ruleMap.get(node.department._id) : undefined;
      if (include !== undefined) return include;
    }
    return false;
  })();
  return normalizeUsageDepartmentRules({
    departments,
    rules: inherited ? [...remaining, { orgId, include: false }] : remaining,
    tree
  });
};

type UsageMatch = {
  teamId: Types.ObjectId;
  tmbId?: Types.ObjectId | { $in: Types.ObjectId[] };
  time: { $gte: Date; $lte: Date };
  source: { $in: NonNullable<UsageCommonFilters['sources']> } | { $exists: true };
  appName: { $regex: RegExp } | { $exists: true };
};

/** 三个读取端共用条件；显式构造 ObjectId，none 始终使用空 $in，绝不扩大为团队全部。 */
export const buildUsageMatch = ({
  teamId,
  scope,
  filters
}: {
  teamId: string;
  scope: ResolvedUsageScope;
  filters: UsageCommonFilters;
}): UsageMatch => ({
  teamId: new Types.ObjectId(teamId),
  ...(scope.kind === 'self'
    ? { tmbId: new Types.ObjectId(scope.tmbId) }
    : scope.kind === 'all'
      ? {}
      : {
          tmbId: { $in: scope.kind === 'none' ? [] : scope.ids.map((id) => new Types.ObjectId(id)) }
        }),
  time: { $gte: new Date(filters.dateStart), $lte: new Date(filters.dateEnd) },
  ...(filters.sources?.length
    ? { source: { $in: filters.sources } }
    : { source: { $exists: true } }),
  ...(filters.projectName
    ? {
        appName: { $regex: new RegExp(replaceRegChars(filters.projectName), 'i') }
      }
    : { appName: { $exists: true } })
});
