import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import type { WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';
import { WorkflowCommandError } from '../domain/diagnostic';
import { compileExecutionEdge } from './compiler';
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

const assertBranchKey = (document: WorkflowDocument, edge: WorkflowExecutionEdge) => {
  if (edge.source.kind !== 'branch') return;
  const node = getDocumentNode(document, edge.source.nodeId);
  const inputKey =
    node.flowNodeType === FlowNodeTypeEnum.ifElseNode
      ? NodeInputKeyEnum.ifElseList
      : node.flowNodeType === FlowNodeTypeEnum.userSelect
        ? NodeInputKeyEnum.userSelectOptions
        : NodeInputKeyEnum.agents;
  const input = node.inputs.find((item) => item.key === inputKey);
  const value = input?.value;
  const keys = (() => {
    if (node.flowNodeType === FlowNodeTypeEnum.userSelect && input && nodeInputIsReference(input)) {
      return [USER_SELECT_REFERENCE_HANDLE_KEY];
    }
    if (!Array.isArray(value)) return [];
    if (node.flowNodeType === FlowNodeTypeEnum.ifElseNode) {
      return [
        ...value.map((item, index) => getIfElseBranchHandleKey(item as IfElseListItemType, index)),
        IfElseResultEnum.ELSE
      ];
    }
    return value
      .map((item) =>
        item && typeof item === 'object' ? (item as { key?: unknown }).key : undefined
      )
      .filter((item): item is string => typeof item === 'string');
  })();
  if (!keys.includes(edge.source.branchKey)) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.branchKeyNotFound,
        severity: 'error',
        nodeId: edge.source.nodeId,
        params: { branchKey: edge.source.branchKey }
      }
    ]);
  }
};

/** 校验复杂执行边的端口配对、作用域和节点能力。 */
export const assertExecutionEdge = (document: WorkflowDocument, edge: WorkflowExecutionEdge) => {
  const sourceNode = getDocumentNode(document, edge.source.nodeId);
  const targetNode = getDocumentNode(document, edge.target.nodeId);
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
  assertBranchKey(document, edge);
  compileExecutionEdge(edge, document);

  const nodesById = new Map(document.nodes.map((node) => [node.nodeId, node]));
  if (
    !isToolWorkflowConnectionAllowed({
      source: sourceNode.nodeId,
      target: targetNode.nodeId,
      isToolConnection: sourceIsTool,
      edges: document.executionEdges.map((item) => ({
        source: item.source.nodeId,
        target: item.target.nodeId,
        targetHandle:
          item.target.kind === 'selectedTools' ? NodeOutputKeyEnum.selectedTools : undefined
      })),
      getNodeById: (nodeId) => nodesById.get(nodeId)
    })
  ) {
    throw new WorkflowCommandError([
      { code: WorkflowDiagnosticCodeEnum.edgeCrossScope, severity: 'error', params: { edge } }
    ]);
  }
};

/** 校验新连线且不写入文档，供同步 Web 回调和内部写入命令共用。 */
export const assertExecutionConnection = ({
  document,
  edge
}: {
  document: WorkflowDocument;
  edge: WorkflowExecutionEdge;
}) => {
  assertExecutionEdge(document, edge);
  if (document.executionEdges.some((item) => executionEdgesEqual(item, edge))) {
    throw new WorkflowCommandError([
      { code: WorkflowDiagnosticCodeEnum.edgeDuplicated, severity: 'error', params: { edge } }
    ]);
  }
};
