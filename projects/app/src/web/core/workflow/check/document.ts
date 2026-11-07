import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { getHandleId } from '@fastgpt/global/common/workflow/reference';
import {
  WORKFLOW_DOCUMENT_SCHEMA_VERSION,
  type WorkflowDocument
} from '@fastgpt/global/core/workflow/type/document';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import {
  WorkflowCommandError,
  type WorkflowDiagnostic
} from '@fastgpt/workflow-core/domain/diagnostic';
import { decompileStoreEdge } from '@fastgpt/workflow-core/edge/compiler';
import type { Edge, Node } from 'reactflow';

/**
 * 无损投影校验快照：保留失效引用和资源标记，不复用保存时的清理流程，不修改画布。
 * ReactFlow 未指定 handle 表示默认端口；显式无效 handle 转为诊断，其他节点和连线继续检查。
 */
export const createWorkflowCheckDocument = ({
  nodes,
  edges,
  chatConfig = {}
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Edge[];
  chatConfig?: AppChatConfigType;
}) => {
  const document: WorkflowDocument = {
    schemaVersion: WORKFLOW_DOCUMENT_SCHEMA_VERSION,
    app: {},
    chatConfig,
    nodes: nodes.map(({ data }) => ({
      ...data,
      name: data.name ?? '',
      // 输出条件包含 UI 函数，不属于领域数据；值与引用原样交给 Core 校验。
      outputs: data.outputs.map(({ invalidCondition: _, ...output }) => output)
    })),
    executionEdges: []
  };
  const diagnostics: WorkflowDiagnostic[] = [];
  for (const edge of edges) {
    const storeEdge = {
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? getHandleId(edge.source, 'source', 'right'),
      targetHandle: edge.targetHandle ?? getHandleId(edge.target, 'target', 'left')
    };
    try {
      document.executionEdges.push(decompileStoreEdge(storeEdge, document));
    } catch (error) {
      if (error instanceof WorkflowCommandError) {
        diagnostics.push(
          ...error.diagnostics.map((diagnostic) => ({
            ...diagnostic,
            params: { ...diagnostic.params, edge: storeEdge }
          }))
        );
      } else {
        diagnostics.push({
          code: WorkflowDiagnosticCodeEnum.edgeInvalid,
          severity: 'error',
          params: {
            edge: storeEdge,
            reason: error instanceof Error ? error.message : String(error)
          }
        });
      }
    }
  }
  return { document, diagnostics };
};
