import { FlowNodeTypeEnum, isInteractiveNodeType, isNestedParentNodeType } from '../node/constant';
import { NodeOutputKeyEnum } from '../constants';
import type {
  FlowNodeTemplateType,
  FlowNodeItemType,
  NodeTemplateContext,
  NodeTemplateContextPredicate
} from '../type/node';

/**
 * 模板展示上下文规则：规则字段全部为空时匹配任何上下文。
 */
export type NodeTemplateContextRule = {
  sourceType?: FlowNodeTypeEnum;
  handleId?: string;
  parentType?: FlowNodeTypeEnum;
};

const matchRule = (rule: NodeTemplateContextRule, ctx: NodeTemplateContext): boolean => {
  if (rule.sourceType !== undefined && rule.sourceType !== ctx.sourceType) return false;
  if (rule.handleId !== undefined && rule.handleId !== ctx.handleId) return false;
  if (rule.parentType !== undefined && rule.parentType !== ctx.parentType) return false;
  return true;
};

/**
 * 白名单工厂：上下文存在且匹配任一规则时展示。
 */
export const createShowInContext = (
  rules: NodeTemplateContextRule[]
): NodeTemplateContextPredicate => {
  return (ctx) => !!ctx && rules.some((rule) => matchRule(rule, ctx));
};

/**
 * 黑名单工厂：匹配任一规则时隐藏；无上下文时展示。
 */
export const createHideInContext = (
  rules: NodeTemplateContextRule[]
): NodeTemplateContextPredicate => {
  return (ctx) => !ctx || !rules.some((rule) => matchRule(rule, ctx));
};

/**
 * 模板在给定上下文中是否可见：未声明谓词的模板为顶级节点，处处可见。
 */
export const isTemplateVisible = (
  template: Pick<FlowNodeTemplateType, 'isShowInContext'>,
  ctx: NodeTemplateContext | null
): boolean => {
  return !template.isShowInContext || template.isShowInContext(ctx);
};

export type NodeContainerCheckError =
  | 'can_not_loop'
  | 'can_not_parallel'
  | 'loop_run_break_must_inside_loop_run'
  | 'can_not_add_inside_container';

/** 使用显式分支保留翻译 key 的静态字面量引用，避免 i18n 清理脚本误删动态 key。 */
export const translateNodeContainerCheckError = (
  checkError: NodeContainerCheckError,
  t: (key: string) => string
) => {
  switch (checkError) {
    case 'can_not_loop':
      return t('workflow:can_not_loop');
    case 'can_not_parallel':
      return t('workflow:can_not_parallel');
    case 'loop_run_break_must_inside_loop_run':
      return t('workflow:loop_run_break_must_inside_loop_run');
    case 'can_not_add_inside_container':
      return t('workflow:can_not_add_inside_container');
  }
};

const UNSUPPORTED_IN_NESTED_NODE_TYPES = new Set<FlowNodeTypeEnum>([
  FlowNodeTypeEnum.workflowStart,
  FlowNodeTypeEnum.loop,
  FlowNodeTypeEnum.loopRun,
  FlowNodeTypeEnum.parallelRun,
  FlowNodeTypeEnum.pluginInput,
  FlowNodeTypeEnum.pluginOutput
]);

/** 统一校验节点是否可以加入目标容器，并返回对应的提示码。 */
export const getNodeContainerCheckError = ({
  node,
  context
}: {
  node: Pick<FlowNodeTemplateType, 'flowNodeType' | 'isShowInContext'>;
  context: NodeTemplateContext;
}): NodeContainerCheckError | undefined => {
  const parentType = context.parentType;

  if (
    node.flowNodeType === FlowNodeTypeEnum.loopRunBreak &&
    parentType !== FlowNodeTypeEnum.loopRun
  ) {
    return 'loop_run_break_must_inside_loop_run';
  }

  if (!parentType) return undefined;

  if (node.flowNodeType === FlowNodeTypeEnum.toolSet && !context.hasToolNode) {
    return 'can_not_add_inside_container';
  }

  if (isNestedParentNodeType(node.flowNodeType)) {
    return parentType === FlowNodeTypeEnum.parallelRun ? 'can_not_parallel' : 'can_not_loop';
  }

  if (parentType === FlowNodeTypeEnum.parallelRun && isInteractiveNodeType(node.flowNodeType)) {
    return 'can_not_parallel';
  }

  if (UNSUPPORTED_IN_NESTED_NODE_TYPES.has(node.flowNodeType)) {
    return parentType === FlowNodeTypeEnum.parallelRun ? 'can_not_parallel' : 'can_not_loop';
  }

  if (!isTemplateVisible(node, context)) return 'can_not_add_inside_container';

  return undefined;
};

/**
 * 构建快捷添加、侧边栏或容器落点共用的展示上下文；会沿入边追溯工具根边，无法建立上下文时返回 null。
 */
export const buildNodeTemplateContext = ({
  sourceNode,
  edges,
  handleId,
  getNodeById,
  isSidebar = false,
  hasToolNode = false,
  hasLoopRunNode = false,
  targetParentType
}: {
  sourceNode:
    | Pick<FlowNodeItemType, 'nodeId' | 'flowNodeType' | 'isTool' | 'parentNodeId'>
    | undefined;
  edges: { source?: string; target: string; targetHandle?: string | null }[];
  handleId?: string | null;
  getNodeById: (nodeId: string | undefined | null) => FlowNodeItemType | undefined;
  isSidebar?: boolean;
  hasToolNode?: boolean;
  hasLoopRunNode?: boolean;
  /** 目标容器类型；用于侧边栏或画布拖拽落点校验。 */
  targetParentType?: FlowNodeTypeEnum | null;
}): NodeTemplateContext | null => {
  if (!sourceNode && !isSidebar) return null;
  const parentNode = sourceNode?.parentNodeId ? getNodeById(sourceNode.parentNodeId) : undefined;
  const isConnectedTool = (() => {
    if (!sourceNode) return false;

    const incomingEdges = new Map<string, typeof edges>();
    for (const edge of edges) {
      const targetEdges = incomingEdges.get(edge.target);
      if (targetEdges) {
        targetEdges.push(edge);
      } else {
        incomingEdges.set(edge.target, [edge]);
      }
    }

    // 工具子流程可经过多个普通节点，沿入边找到任一 selectedTools 根边即可。
    const pendingNodeIds = [sourceNode.nodeId];
    const visitedNodeIds = new Set<string>();
    while (pendingNodeIds.length) {
      const nodeId = pendingNodeIds.pop()!;
      if (visitedNodeIds.has(nodeId)) continue;
      visitedNodeIds.add(nodeId);

      for (const edge of incomingEdges.get(nodeId) ?? []) {
        if (edge.targetHandle === NodeOutputKeyEnum.selectedTools) return true;
        if (edge.source) pendingNodeIds.push(edge.source);
      }
    }

    return false;
  })();
  return {
    isSidebar,
    sourceNodeId: sourceNode?.nodeId ?? null,
    sourceType: sourceNode?.flowNodeType ?? null,
    sourceIsTool: !!sourceNode?.isTool,
    isConnectedTool,
    handleId: handleId ?? null,
    parentType:
      targetParentType === undefined ? (parentNode?.flowNodeType ?? null) : targetParentType,
    hasToolNode,
    hasLoopRunNode
  };
};
