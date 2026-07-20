import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import {
  WorkflowCommandError,
  connectExecutionEdge,
  decompileStoreEdge,
  removeNode,
  type WorkflowDiagnostic
} from '@fastgpt/workflow-core';
import type { Connection, Edge, Node } from 'reactflow';
import { reactFlowStateToWorkflowDocument } from './document';

export type WorkflowCoreAdapterResult<T> =
  | { status: 'success'; data: T }
  | { status: 'domain-error'; diagnostics: WorkflowDiagnostic[] }
  | { status: 'adapter-error'; error: unknown };

const executeWorkflowCoreAction = <T>(action: () => T): WorkflowCoreAdapterResult<T> => {
  try {
    return { status: 'success', data: action() };
  } catch (error) {
    if (error instanceof WorkflowCommandError) {
      return { status: 'domain-error', diagnostics: error.diagnostics };
    }
    return { status: 'adapter-error', error };
  }
};

/** 在 Web 写入 ReactFlow edge 前，复用 Core 的复杂端口和作用域规则。 */
export const validateConnectionWithCore = ({
  nodes,
  edges,
  connection,
  chatConfig
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Edge<any>[];
  connection: Connection;
  chatConfig?: AppChatConfigType;
}): WorkflowCoreAdapterResult<undefined> => {
  if (
    !connection.source ||
    !connection.target ||
    !connection.sourceHandle ||
    !connection.targetHandle
  ) {
    return {
      status: 'domain-error',
      diagnostics: [{ code: 'WORKFLOW_EDGE_HANDLE_UNSUPPORTED', severity: 'error' }]
    };
  }

  return executeWorkflowCoreAction(() => {
    const document = reactFlowStateToWorkflowDocument({ nodes, edges, chatConfig });
    const storeEdge: StoreEdgeItemType = {
      source: connection.source!,
      sourceHandle: connection.sourceHandle!,
      target: connection.target!,
      targetHandle: connection.targetHandle!
    };
    connectExecutionEdge({
      document,
      edge: decompileStoreEdge(storeEdge, document)
    });
    return undefined;
  });
};

/** 复用 Core 的递归删除语义，供 ReactFlow 生成完整 remove change 集合。 */
export const getRemovalNodeIdsWithCore = ({
  nodes,
  edges,
  nodeId,
  chatConfig
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Edge<any>[];
  nodeId: string;
  chatConfig?: AppChatConfigType;
}): WorkflowCoreAdapterResult<string[]> =>
  executeWorkflowCoreAction(() => {
    const document = reactFlowStateToWorkflowDocument({ nodes, edges, chatConfig });
    return removeNode({ document, nodeId }).deletedNodeIds;
  });
