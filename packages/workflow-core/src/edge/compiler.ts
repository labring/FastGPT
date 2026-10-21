import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { getHandleId } from '@fastgpt/global/common/workflow/reference';
import {
  type StoreEdgeItemType,
  type ExecutionSourcePortRef,
  type ExecutionTargetPortRef,
  type WorkflowExecutionEdge
} from '@fastgpt/global/core/workflow/type/edge';
import type { WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';
import { WorkflowCommandError } from '../domain/diagnostic';

const assertNode = (document: WorkflowDocument, nodeId: string) => {
  const node = document.nodes.find((item) => item.nodeId === nodeId);
  if (!node) {
    throw new WorkflowCommandError([
      { code: WorkflowDiagnosticCodeEnum.nodeNotFound, severity: 'error', nodeId }
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
          code: WorkflowDiagnosticCodeEnum.branchPortUnsupported,
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
        code: WorkflowDiagnosticCodeEnum.sourceOutputNotFound,
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
  const sourceNode = assertNode(document, edge.source);
  const isBranchNode = [
    FlowNodeTypeEnum.ifElseNode,
    FlowNodeTypeEnum.userSelect,
    FlowNodeTypeEnum.classifyQuestion
  ].includes(sourceNode.flowNodeType);
  // 分支 key 也允许叫 right；这些节点没有普通出口，不能把同名分支反编译成 next。
  if (edge.sourceHandle === getHandleId(edge.source, 'source', 'right') && !isBranchNode) {
    return { kind: 'next', nodeId: edge.source };
  }

  const prefix = getHandleId(edge.source, 'source', '');
  if (!edge.sourceHandle.startsWith(prefix)) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.edgeHandleUnsupported,
        severity: 'error',
        params: { edge }
      }
    ]);
  }

  const key = edge.sourceHandle.slice(prefix.length);
  const sourceOutput = sourceNode.outputs.find(
    (output) => output.key === key && output.type === FlowNodeOutputTypeEnum.source
  );
  if (sourceOutput) return { kind: 'sourceOutput', nodeId: edge.source, outputKey: key };
  if (isBranchNode) {
    return { kind: 'branch', nodeId: edge.source, branchKey: key };
  }
  throw new WorkflowCommandError([
    {
      code: WorkflowDiagnosticCodeEnum.edgeHandleUnsupported,
      severity: 'error',
      params: { edge }
    }
  ]);
};

const parseTargetHandle = (edge: StoreEdgeItemType): ExecutionTargetPortRef => {
  if (edge.targetHandle === NodeOutputKeyEnum.selectedTools) {
    return { kind: 'selectedTools', nodeId: edge.target };
  }
  // 旧画布允许从右侧接入；两侧都表示普通目标端口，编译时统一输出 left。
  if (
    edge.targetHandle === getHandleId(edge.target, 'target', 'left') ||
    edge.targetHandle === getHandleId(edge.target, 'target', 'right')
  ) {
    return { kind: 'target', nodeId: edge.target };
  }

  throw new WorkflowCommandError([
    {
      code: WorkflowDiagnosticCodeEnum.edgeHandleUnsupported,
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
      { code: WorkflowDiagnosticCodeEnum.toolEdgeInvalid, severity: 'error', params: { edge } }
    ]);
  }
  return result;
};
