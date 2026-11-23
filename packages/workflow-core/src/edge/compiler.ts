import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getHandleId } from '@fastgpt/global/common/workflow/reference';
import {
  getWorkflowBranchInputKey,
  normalizeWorkflowSourceHandle,
  normalizeWorkflowTargetHandle
} from '@fastgpt/global/common/workflow/connection';
import {
  type StoreEdgeItemType,
  type ExecutionSourcePortRef,
  type ExecutionTargetPortRef,
  type WorkflowExecutionEdge
} from '@fastgpt/global/core/workflow/type/edge';
import type { WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';
import { WorkflowCommandError } from '../domain/diagnostic';

const assertNode = (document: Pick<WorkflowDocument, 'nodes'>, nodeId: string) => {
  const node = document.nodes.find((item) => item.nodeId === nodeId);
  if (!node) {
    throw new WorkflowCommandError([
      { code: WorkflowDiagnosticCodeEnum.nodeNotFound, severity: 'error', nodeId }
    ]);
  }
  return node;
};

/** 将语义出口编码为 StoreEdge 的 sourceHandle。 */
export const getExecutionSourceHandle = (port: ExecutionSourcePortRef): string => {
  if (port.kind === 'next') return getHandleId(port.nodeId, 'source', 'right');
  if (port.kind === 'catch') return getHandleId(port.nodeId, 'source_catch', 'right');
  if (port.kind === 'selectedTools') return NodeOutputKeyEnum.selectedTools;
  if (port.kind === 'branch') return getHandleId(port.nodeId, 'source', port.branchKey);
  return getHandleId(port.nodeId, 'source', port.outputKey);
};

/** 将语义入口编码为 StoreEdge 的 targetHandle。 */
export const getExecutionTargetHandle = (port: ExecutionTargetPortRef): string =>
  port.kind === 'selectedTools'
    ? NodeOutputKeyEnum.selectedTools
    : getHandleId(port.nodeId, 'target', 'left');

/** 校验边涉及的节点和源端口，再将语义边编译为 StoreEdge。 */
export const compileExecutionEdge = (
  { source, target }: WorkflowExecutionEdge,
  document: Pick<WorkflowDocument, 'nodes'>
): StoreEdgeItemType => {
  const sourceNode = assertNode(document, source.nodeId);
  if (
    source.kind === 'branch' &&
    getWorkflowBranchInputKey(sourceNode.flowNodeType) === undefined
  ) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.branchPortUnsupported,
        severity: 'error',
        nodeId: source.nodeId,
        params: { branchKey: source.branchKey }
      }
    ]);
  }
  if (source.kind === 'sourceOutput') {
    const output = sourceNode.outputs.find((item) => item.key === source.outputKey);
    if (!output || output.type !== FlowNodeOutputTypeEnum.source || output.invalid === true) {
      throw new WorkflowCommandError([
        {
          code: WorkflowDiagnosticCodeEnum.sourceOutputNotFound,
          severity: 'error',
          nodeId: source.nodeId,
          params: { outputKey: source.outputKey }
        }
      ]);
    }
  }
  assertNode(document, target.nodeId);

  return {
    source: source.nodeId,
    sourceHandle: getExecutionSourceHandle(source),
    target: target.nodeId,
    targetHandle: getExecutionTargetHandle(target)
  };
};

/** 只解析源出口，供完整边导入和历史拓扑检查共用；不校验目标端口或当前分支配置。 */
export const decompileStoreSourcePort = ({
  edge,
  document
}: {
  edge: Pick<StoreEdgeItemType, 'source' | 'sourceHandle'>;
  document: Pick<WorkflowDocument, 'nodes'>;
}): ExecutionSourcePortRef => {
  if (edge.sourceHandle === NodeOutputKeyEnum.selectedTools) {
    return { kind: 'selectedTools', nodeId: edge.source };
  }
  if (edge.sourceHandle === getHandleId(edge.source, 'source_catch', 'right')) {
    return { kind: 'catch', nodeId: edge.source };
  }
  const sourceNode = assertNode(document, edge.source);
  const isBranchNode = getWorkflowBranchInputKey(sourceNode.flowNodeType) !== undefined;
  // 分支 key 允许叫 right；这些节点没有普通出口。
  if (
    !isBranchNode &&
    normalizeWorkflowSourceHandle(edge.sourceHandle, sourceNode) ===
      getHandleId(edge.source, 'source', 'right')
  ) {
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
  if (
    normalizeWorkflowTargetHandle(edge.targetHandle, edge.target) ===
    getHandleId(edge.target, 'target', 'left')
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
  document: Pick<WorkflowDocument, 'nodes'>
): WorkflowExecutionEdge => {
  assertNode(document, edge.source);
  assertNode(document, edge.target);
  const result = {
    source: decompileStoreSourcePort({ edge, document }),
    target: parseTargetHandle(edge)
  };
  if ((result.source.kind === 'selectedTools') !== (result.target.kind === 'selectedTools')) {
    throw new WorkflowCommandError([
      { code: WorkflowDiagnosticCodeEnum.toolEdgeInvalid, severity: 'error', params: { edge } }
    ]);
  }
  return result;
};
