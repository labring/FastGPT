import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import type { WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';
import { WorkflowCommandError, type WorkflowDiagnostic } from '../domain/diagnostic';
import { compileExecutionEdge, decompileStoreEdge } from './compiler';
import {
  type WorkflowExecutionEdge,
  type ExecutionSourcePortRef
} from '@fastgpt/global/core/workflow/type/edge';

import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { isToolWorkflowConnectionAllowed } from '@fastgpt/global/common/workflow/connection';
import { IfElseResultEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import { nodeInputIsReference } from '@fastgpt/global/common/workflow/reference';
import { USER_SELECT_REFERENCE_HANDLE_KEY } from '@fastgpt/global/core/workflow/template/system/interactive/userSelect';
import { getIfElseBranchHandleKey } from '@fastgpt/global/common/workflow/condition';
import type { IfElseListItemType } from '@fastgpt/global/core/workflow/template/system/ifElse/type';
import { getDocumentNode } from '../nesting/service';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import {
  buildNodeTemplateContext,
  getNodeContainerCheckError,
  isTemplateVisible
} from '@fastgpt/global/core/workflow/template/context';
import { getHandleId } from '@fastgpt/global/common/workflow/reference';
import {
  NODE_TYPES_WITHOUT_NEXT_PORT,
  NODE_TYPES_WITHOUT_TARGET_PORT,
  NODE_TYPES_WITHOUT_TOOL_TARGET
} from '../template/contract';

export const executionEdgesEqual = (left: WorkflowExecutionEdge, right: WorkflowExecutionEdge) =>
  JSON.stringify(left) === JSON.stringify(right);

/** 返回节点在 insert 场景下用于承接旧 target 的默认执行出口。 */
export const getDefaultExecutionSourcePort = (
  document: WorkflowDocument,
  nodeId: string
): ExecutionSourcePortRef => {
  const node = getDocumentNode(document, nodeId);
  if (node.flowNodeType === FlowNodeTypeEnum.ifElseNode) {
    return { kind: 'branch', nodeId, branchKey: IfElseResultEnum.ELSE };
  }
  if (
    node.flowNodeType === FlowNodeTypeEnum.userSelect ||
    node.flowNodeType === FlowNodeTypeEnum.classifyQuestion
  ) {
    const inputKey =
      node.flowNodeType === FlowNodeTypeEnum.userSelect
        ? NodeInputKeyEnum.userSelectOptions
        : NodeInputKeyEnum.agents;
    const input = node.inputs.find((item) => item.key === inputKey);
    // 动态选项共用一个出口，不再按运行前未知的选项生成分支。
    if (node.flowNodeType === FlowNodeTypeEnum.userSelect && input && nodeInputIsReference(input)) {
      return { kind: 'branch', nodeId, branchKey: USER_SELECT_REFERENCE_HANDLE_KEY };
    }
    const options = input?.value;
    const branchKey =
      Array.isArray(options) && options[0] && typeof options[0].key === 'string'
        ? options[0].key
        : undefined;
    if (branchKey) return { kind: 'branch', nodeId, branchKey };
  }
  if (NODE_TYPES_WITHOUT_NEXT_PORT.has(node.flowNodeType)) {
    throw new WorkflowCommandError([
      { code: WorkflowDiagnosticCodeEnum.nodeHasNoDefaultSourcePort, severity: 'error', nodeId }
    ]);
  }
  return { kind: 'next', nodeId };
};

/** 返回节点当前配置实际声明的分支端口，供连接校验和显式删除端口的边清理共用。 */
export const getExecutionBranchKeys = (node: StoreNodeItemType): string[] => {
  if (
    ![
      FlowNodeTypeEnum.ifElseNode,
      FlowNodeTypeEnum.userSelect,
      FlowNodeTypeEnum.classifyQuestion
    ].includes(node.flowNodeType)
  )
    return [];
  const inputKey =
    node.flowNodeType === FlowNodeTypeEnum.ifElseNode
      ? NodeInputKeyEnum.ifElseList
      : node.flowNodeType === FlowNodeTypeEnum.userSelect
        ? NodeInputKeyEnum.userSelectOptions
        : NodeInputKeyEnum.agents;
  const input = node.inputs.find((item) => item.key === inputKey);
  if (node.flowNodeType === FlowNodeTypeEnum.userSelect && input && nodeInputIsReference(input))
    return [USER_SELECT_REFERENCE_HANDLE_KEY];
  const value = Array.isArray(input?.value) ? input.value : [];
  if (node.flowNodeType === FlowNodeTypeEnum.ifElseNode)
    return [
      ...value.map((item, index) => getIfElseBranchHandleKey(item as IfElseListItemType, index)),
      IfElseResultEnum.ELSE
    ];
  return value
    .map((item) => (item && typeof item === 'object' ? (item as { key?: unknown }).key : undefined))
    .filter((key): key is string => typeof key === 'string');
};

type ConnectionCandidate = {
  source?: string | null;
  target?: string | null;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

type ConnectionGraphEdge = {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export type ExecutionConnectionResult =
  | { allowed: true }
  | { allowed: false; reason: WorkflowDiagnostic };

/**
 * 唯一的执行连线判定入口：画布显隐、提交、Core 命令和整图检查共用。
 * 同时接受画布 handle 和语义端口；仅解析候选边，历史边只读取拓扑，避免无关旧 handle 阻断编辑。
 * 默认检查重复边；检查文档中已有边时关闭该项，其余规则完全一致。检查不修改节点或连线。
 */
export const checkExecutionConnection = ({
  connection,
  edges,
  getNodeById,
  checkDuplicate = true
}: {
  connection: ConnectionCandidate | WorkflowExecutionEdge;
  edges: (ConnectionGraphEdge | WorkflowExecutionEdge)[];
  getNodeById: (nodeId: string) => StoreNodeItemType | undefined;
  checkDuplicate?: boolean;
}): ExecutionConnectionResult => {
  try {
    /** 两种端口表示只在边界归一化，后面的规则只处理语义端口。 */
    const isExecutionEdge = (
      item: ConnectionCandidate | WorkflowExecutionEdge
    ): item is WorkflowExecutionEdge => typeof item.source === 'object' && item.source !== null;
    const sourceId = isExecutionEdge(connection) ? connection.source.nodeId : connection.source;
    const targetId = isExecutionEdge(connection) ? connection.target.nodeId : connection.target;
    const sourceNode = sourceId ? getNodeById(sourceId) : undefined;
    const targetNode = targetId ? getNodeById(targetId) : undefined;
    if (!sourceNode || !targetNode) {
      throw new WorkflowCommandError([
        {
          code: WorkflowDiagnosticCodeEnum.nodeNotFound,
          severity: 'error',
          nodeId: (!sourceNode ? sourceId : targetId) ?? undefined
        }
      ]);
    }
    const document = { nodes: [sourceNode, targetNode] };
    const edge = (() => {
      if (isExecutionEdge(connection)) return connection;
      const candidate = connection;
      if (!candidate.sourceHandle || !candidate.targetHandle) {
        throw new WorkflowCommandError([
          { code: WorkflowDiagnosticCodeEnum.edgeHandleUnsupported, severity: 'error' }
        ]);
      }
      return decompileStoreEdge(
        {
          source: sourceNode.nodeId,
          target: targetNode.nodeId,
          sourceHandle: candidate.sourceHandle,
          targetHandle: candidate.targetHandle
        },
        document
      );
    })();
    const graphEdges = edges.map((item): ConnectionGraphEdge => {
      if (!isExecutionEdge(item)) return item;
      return {
        source: item.source.nodeId,
        target: item.target.nodeId,
        targetHandle:
          item.target.kind === 'selectedTools' ? NodeOutputKeyEnum.selectedTools : undefined
      };
    });
    const compiled = assertExecutionEdgeRules({ document, edge, graphEdges, getNodeById });

    // 普通入口的历史左右 handle 等价；工具出口 ID 全局相同，必须同时比较 source 节点。
    const duplicated =
      checkDuplicate &&
      edges.some((item) => {
        if (isExecutionEdge(item)) return executionEdgesEqual(item, edge);
        const existing = item;
        return (
          existing.source === compiled.source &&
          existing.target === compiled.target &&
          existing.sourceHandle === compiled.sourceHandle &&
          (existing.targetHandle === compiled.targetHandle ||
            (edge.target.kind === 'target' &&
              existing.targetHandle === getHandleId(existing.target, 'target', 'right')))
        );
      });
    if (duplicated) {
      throw new WorkflowCommandError([
        { code: WorkflowDiagnosticCodeEnum.edgeDuplicated, severity: 'error', params: { edge } }
      ]);
    }
    return { allowed: true };
  } catch (error) {
    if (error instanceof WorkflowCommandError)
      return { allowed: false, reason: error.diagnostics[0] };
    throw error;
  }
};

/** 规则只在此处定义；对外通过 checkExecutionConnection 返回拒绝原因。 */
const assertExecutionEdgeRules = ({
  document,
  edge,
  graphEdges,
  getNodeById
}: {
  document: Pick<WorkflowDocument, 'nodes'>;
  edge: WorkflowExecutionEdge;
  graphEdges: ConnectionGraphEdge[];
  getNodeById: (nodeId: string) => StoreNodeItemType | undefined;
}) => {
  const [sourceNode, targetNode] = document.nodes;
  if (sourceNode.nodeId === targetNode.nodeId) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.edgeSelfConnection,
        severity: 'error',
        nodeId: sourceNode.nodeId
      }
    ]);
  }
  if (sourceNode.parentNodeId !== targetNode.parentNodeId) {
    throw new WorkflowCommandError([
      { code: WorkflowDiagnosticCodeEnum.edgeCrossScope, severity: 'error', params: { edge } }
    ]);
  }
  const sourceIsTool = edge.source.kind === 'selectedTools';
  const targetIsTool = edge.target.kind === 'selectedTools';
  if (sourceIsTool !== targetIsTool) {
    throw new WorkflowCommandError([
      { code: WorkflowDiagnosticCodeEnum.toolEdgeInvalid, severity: 'error', params: { edge } }
    ]);
  }
  if (sourceIsTool) {
    if (
      sourceNode.flowNodeType !== FlowNodeTypeEnum.toolCall ||
      NODE_TYPES_WITHOUT_TOOL_TARGET.has(targetNode.flowNodeType)
    ) {
      throw new WorkflowCommandError([
        {
          code: WorkflowDiagnosticCodeEnum.toolEdgeNodeInvalid,
          severity: 'error',
          params: { edge }
        }
      ]);
    }
  } else if (edge.target.kind !== 'target') {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.edgeTargetKindInvalid,
        severity: 'error',
        params: { edge }
      }
    ]);
  }
  if (
    edge.target.kind === 'target' &&
    NODE_TYPES_WITHOUT_TARGET_PORT.has(targetNode.flowNodeType)
  ) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.targetPortUnsupported,
        severity: 'error',
        nodeId: targetNode.nodeId
      }
    ]);
  }
  if (edge.source.kind === 'catch' && sourceNode.catchError !== true) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.catchNotEnabled,
        severity: 'error',
        nodeId: sourceNode.nodeId
      }
    ]);
  }
  if (edge.source.kind === 'next' && NODE_TYPES_WITHOUT_NEXT_PORT.has(sourceNode.flowNodeType)) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.nextPortUnsupported,
        severity: 'error',
        nodeId: sourceNode.nodeId
      }
    ]);
  }
  if (
    edge.source.kind === 'branch' &&
    !getExecutionBranchKeys(sourceNode).includes(edge.source.branchKey)
  ) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.branchKeyNotFound,
        severity: 'error',
        nodeId: sourceNode.nodeId,
        params: { branchKey: edge.source.branchKey }
      }
    ]);
  }
  const compiled = compileExecutionEdge(edge, document);

  const incoming = graphEdges.filter((item) => item.target === targetNode.nodeId);
  if (
    sourceIsTool &&
    incoming.some((item) => item.targetHandle !== NodeOutputKeyEnum.selectedTools)
  ) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.toolTargetHasNormalEdges,
        severity: 'error',
        nodeId: targetNode.nodeId
      }
    ]);
  }
  const otherOwner =
    sourceIsTool &&
    incoming.find(
      (item) =>
        item.targetHandle === NodeOutputKeyEnum.selectedTools && item.source !== sourceNode.nodeId
    );
  if (otherOwner) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.toolTargetAlreadyAttached,
        severity: 'error',
        nodeId: targetNode.nodeId,
        params: { ownerNodeId: otherOwner.source }
      }
    ]);
  }
  if (
    !sourceIsTool &&
    incoming.some((item) => item.targetHandle === NodeOutputKeyEnum.selectedTools)
  ) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.normalTargetHasToolEdges,
        severity: 'error',
        nodeId: targetNode.nodeId
      }
    ]);
  }
  if (
    !isToolWorkflowConnectionAllowed({
      source: sourceNode.nodeId,
      target: targetNode.nodeId,
      isToolConnection: sourceIsTool,
      edges: graphEdges,
      getNodeById
    })
  ) {
    throw new WorkflowCommandError([
      { code: WorkflowDiagnosticCodeEnum.edgeCrossScope, severity: 'error', params: { edge } }
    ]);
  }

  const targetTemplate = moduleTemplatesFlat.find(
    (item) => item.flowNodeType === targetNode.flowNodeType
  );
  const context = buildNodeTemplateContext({
    sourceNode,
    edges: graphEdges,
    handleId: sourceIsTool ? NodeOutputKeyEnum.selectedTools : compiled.sourceHandle,
    getNodeById: (nodeId) => (nodeId ? getNodeById(nodeId) : undefined)
  });
  if (targetTemplate && context) {
    const containerError = getNodeContainerCheckError({ node: targetTemplate, context });
    if (containerError || !isTemplateVisible(targetTemplate, context)) {
      throw new WorkflowCommandError([
        {
          code: containerError
            ? WorkflowDiagnosticCodeEnum.nodeNotAllowedInContainer
            : WorkflowDiagnosticCodeEnum.templateUnavailable,
          severity: 'error',
          nodeId: targetNode.nodeId,
          params: { reason: containerError ?? 'connection-context' }
        }
      ]);
    }
  }
  return compiled;
};

/** 整图检查已有边时不把自身当作重复边，其余规则与拖线完全相同。 */
export const assertExecutionEdge = (document: WorkflowDocument, edge: WorkflowExecutionEdge) => {
  const result = checkExecutionConnection({
    connection: edge,
    edges: document.executionEdges,
    getNodeById: (nodeId) => document.nodes.find((node) => node.nodeId === nodeId),
    checkDuplicate: false
  });
  if (!result.allowed) throw new WorkflowCommandError([result.reason]);
};

/** 命令写入前复用相同判定，只把拒绝结果转换为领域异常。 */
export const assertExecutionConnection = ({
  document,
  edge
}: {
  document: WorkflowDocument;
  edge: WorkflowExecutionEdge;
}) => {
  const result = checkExecutionConnection({
    connection: edge,
    edges: document.executionEdges,
    getNodeById: (nodeId) => document.nodes.find((node) => node.nodeId === nodeId)
  });
  if (!result.allowed) throw new WorkflowCommandError([result.reason]);
};
