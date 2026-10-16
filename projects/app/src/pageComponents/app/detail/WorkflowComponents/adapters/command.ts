import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import {
  WorkflowCommandError,
  type WorkflowDiagnostic
} from '@fastgpt/workflow-core/domain/diagnostic';
import { assertExecutionConnection } from '@fastgpt/workflow-core/edge/validation';
import { decompileStoreEdge } from '@fastgpt/workflow-core/edge/compiler';
import { planNodeRemoval } from '@fastgpt/workflow-core/node/removal';
import { type WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';
import type { Connection, Edge, Node } from 'reactflow';
import { reactFlowStateToWorkflowDocument } from './document';

export type WorkflowCoreAdapterResult<T> =
  | { status: 'success'; data: T }
  | { status: 'domain-error'; diagnostics: WorkflowDiagnostic[] }
  | { status: 'adapter-error'; error: unknown };

/** 旧画布无法投影时允许 Web 回退；只有新命令本身的领域错误才阻断操作。 */
const executeWorkflowCoreAction = <T>({
  graph,
  action
}: {
  graph: Parameters<typeof reactFlowStateToWorkflowDocument>[0];
  action: (document: WorkflowDocument) => T;
}): WorkflowCoreAdapterResult<T> => {
  const projected = (() => {
    try {
      return { status: 'success' as const, data: reactFlowStateToWorkflowDocument(graph) };
    } catch (error) {
      return { status: 'adapter-error' as const, error };
    }
  })();
  if (projected.status === 'adapter-error') return projected;

  try {
    return { status: 'success', data: action(projected.data) };
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

  return executeWorkflowCoreAction({
    graph: { nodes, edges, chatConfig },
    action: (document) => {
      const storeEdge: StoreEdgeItemType = {
        source: connection.source!,
        sourceHandle: connection.sourceHandle!,
        target: connection.target!,
        targetHandle: connection.targetHandle!
      };
      assertExecutionConnection({
        document,
        edge: decompileStoreEdge(storeEdge, document)
      });
      return undefined;
    }
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
  executeWorkflowCoreAction({
    graph: { nodes, edges, chatConfig },
    action: (document) => planNodeRemoval({ document, nodeId }).deletedNodeIds
  });
