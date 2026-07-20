import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { WorkflowDocument } from '../domain/document';
import { WorkflowCommandError } from '../domain/diagnostic';
import type { ExecutionSourcePortRef, ExecutionTargetPortRef, WorkflowExecutionEdge } from './type';

const assertNode = (document: WorkflowDocument, nodeId: string) => {
  const node = document.nodes.find((item) => item.nodeId === nodeId);
  if (!node) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_NODE_NOT_FOUND', severity: 'error', nodeId }
    ]);
  }
  return node;
};

const compileSourceHandle = (port: ExecutionSourcePortRef, document: WorkflowDocument): string => {
  const node = assertNode(document, port.nodeId);
  if (port.kind === 'next') return getHandleId(port.nodeId, 'source', 'right');
  if (port.kind === 'catch') return getHandleId(port.nodeId, 'source_catch', 'right');
  if (port.kind === 'selectedTools') return NodeOutputKeyEnum.selectedTools;
  if (port.kind === 'branch') {
    if (
      ![
        FlowNodeTypeEnum.ifElseNode,
        FlowNodeTypeEnum.userSelect,
        FlowNodeTypeEnum.classifyQuestion
      ].includes(node.flowNodeType)
    ) {
      throw new WorkflowCommandError([
        {
          code: 'WORKFLOW_BRANCH_PORT_UNSUPPORTED',
          severity: 'error',
          nodeId: port.nodeId,
          params: { branchKey: port.branchKey }
        }
      ]);
    }
    return getHandleId(port.nodeId, 'source', port.branchKey);
  }

  const output = node.outputs.find((item) => item.key === port.outputKey);
  if (!output || output.type !== FlowNodeOutputTypeEnum.source) {
    throw new WorkflowCommandError([
      {
        code: 'WORKFLOW_SOURCE_OUTPUT_NOT_FOUND',
        severity: 'error',
        nodeId: port.nodeId,
        params: { outputKey: port.outputKey }
      }
    ]);
  }
  return getHandleId(port.nodeId, 'source', port.outputKey);
};

const compileTargetHandle = (port: ExecutionTargetPortRef, document: WorkflowDocument): string => {
  assertNode(document, port.nodeId);
  return port.kind === 'selectedTools'
    ? NodeOutputKeyEnum.selectedTools
    : getHandleId(port.nodeId, 'target', 'left');
};

/** 将稳定语义端口编译为 FastGPT 当前 StoreEdge handle。 */
export const compileExecutionEdge = (
  edge: WorkflowExecutionEdge,
  document: WorkflowDocument
): StoreEdgeItemType => ({
  source: edge.source.nodeId,
  sourceHandle: compileSourceHandle(edge.source, document),
  target: edge.target.nodeId,
  targetHandle: compileTargetHandle(edge.target, document)
});

const parseSourceHandle = ({
  edge,
  document
}: {
  edge: StoreEdgeItemType;
  document: WorkflowDocument;
}): ExecutionSourcePortRef => {
  if (edge.sourceHandle === NodeOutputKeyEnum.selectedTools) {
    return { kind: 'selectedTools', nodeId: edge.source };
  }
  if (edge.sourceHandle === getHandleId(edge.source, 'source_catch', 'right')) {
    return { kind: 'catch', nodeId: edge.source };
  }
  if (edge.sourceHandle === getHandleId(edge.source, 'source', 'right')) {
    return { kind: 'next', nodeId: edge.source };
  }

  const prefix = getHandleId(edge.source, 'source', '');
  if (!edge.sourceHandle.startsWith(prefix)) {
    throw new WorkflowCommandError([
      {
        code: 'WORKFLOW_EDGE_HANDLE_UNSUPPORTED',
        severity: 'error',
        params: { edge }
      }
    ]);
  }

  const key = edge.sourceHandle.slice(prefix.length);
  const sourceNode = assertNode(document, edge.source);
  const sourceOutput = sourceNode.outputs.find(
    (output) => output.key === key && output.type === FlowNodeOutputTypeEnum.source
  );
  if (sourceOutput) return { kind: 'sourceOutput', nodeId: edge.source, outputKey: key };
  if (
    [
      FlowNodeTypeEnum.ifElseNode,
      FlowNodeTypeEnum.userSelect,
      FlowNodeTypeEnum.classifyQuestion
    ].includes(sourceNode.flowNodeType)
  ) {
    return { kind: 'branch', nodeId: edge.source, branchKey: key };
  }
  throw new WorkflowCommandError([
    {
      code: 'WORKFLOW_EDGE_HANDLE_UNSUPPORTED',
      severity: 'error',
      params: { edge }
    }
  ]);
};

const parseTargetHandle = (edge: StoreEdgeItemType): ExecutionTargetPortRef => {
  if (edge.targetHandle === NodeOutputKeyEnum.selectedTools) {
    return { kind: 'selectedTools', nodeId: edge.target };
  }
  if (edge.targetHandle === getHandleId(edge.target, 'target', 'left')) {
    return { kind: 'target', nodeId: edge.target };
  }

  throw new WorkflowCommandError([
    {
      code: 'WORKFLOW_EDGE_HANDLE_UNSUPPORTED',
      severity: 'error',
      params: { edge }
    }
  ]);
};

/** 反编译 StoreEdge；未知 handle 会阻断，避免导入时静默丢边。 */
export const decompileStoreEdge = (
  edge: StoreEdgeItemType,
  document: WorkflowDocument
): WorkflowExecutionEdge => {
  assertNode(document, edge.source);
  assertNode(document, edge.target);
  const result = {
    source: parseSourceHandle({ edge, document }),
    target: parseTargetHandle(edge)
  };
  if ((result.source.kind === 'selectedTools') !== (result.target.kind === 'selectedTools')) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_TOOL_EDGE_INVALID', severity: 'error', params: { edge } }
    ]);
  }
  return result;
};
