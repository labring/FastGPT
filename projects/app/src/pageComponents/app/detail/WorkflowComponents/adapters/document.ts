import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { decompileStoreWorkflow, type WorkflowDocument } from '@fastgpt/workflow-core';
import type { Edge, Node } from 'reactflow';
import { uiWorkflow2StoreWorkflow } from '../utils';

/**
 * 将 ReactFlow 编辑状态投影为唯一的 WorkflowDocument 领域状态。
 * ReactFlow 外层状态和模板函数在 Store 投影阶段被移除，后续 Web 命令统一复用该入口。
 */
export const reactFlowStateToWorkflowDocument = ({
  nodes,
  edges,
  chatConfig = {}
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Edge<any>[];
  chatConfig?: AppChatConfigType;
}): WorkflowDocument => {
  const storeWorkflow = uiWorkflow2StoreWorkflow({ nodes, edges });
  return decompileStoreWorkflow({ workflow: { ...storeWorkflow, chatConfig } });
};
