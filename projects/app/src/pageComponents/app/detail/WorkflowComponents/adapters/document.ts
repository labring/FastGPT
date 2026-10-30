import type { AppChatConfigType, AppDetailType } from '@fastgpt/global/core/app/type';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { decompileStoreWorkflow } from '@fastgpt/workflow-core/store/decompile';
import { type WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';
import type { Edge, Node } from '@xyflow/react';
import { uiWorkflow2StoreWorkflow } from '../utils';
import { serializeRuntime } from '@/web/core/workflow/editor/codec';
import type { WorkflowRuntimePort } from '@fastgpt/global/core/workflow/editor/types';

/**
 * 将 ReactFlow 编辑状态投影为唯一的 WorkflowDocument 领域状态。
 * ReactFlow 外层状态和模板函数在 Store 投影阶段被移除，后续 Web 命令统一复用该入口。
 */
export const reactFlowStateToWorkflowDocument = ({
  nodes,
  edges,
  chatConfig = {},
  app
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Edge<any>[];
  chatConfig?: AppChatConfigType;
  app?: WorkflowDocument['app'];
}): WorkflowDocument => {
  const storeWorkflow = uiWorkflow2StoreWorkflow({ nodes, edges, chatConfig });
  const document = decompileStoreWorkflow({ workflow: { ...storeWorkflow, chatConfig } });
  return app ? { ...document, app: structuredClone(app) } : document;
};

/** Serialize the Runtime document for Builder checksum/chat without reading the renderer projection. */
export const workflowRuntimeToWorkflowDocument = ({
  runtime,
  chatConfig,
  app
}: {
  runtime: WorkflowRuntimePort;
  chatConfig?: AppChatConfigType;
  app?: WorkflowDocument['app'];
}): WorkflowDocument => {
  const workflow = serializeRuntime(runtime);
  const document = decompileStoreWorkflow({
    workflow: { ...workflow, chatConfig: chatConfig ?? workflow.chatConfig }
  });
  return app ? { ...document, app: structuredClone(app) } : document;
};

/** 只投影 WorkflowDocument 领域需要的应用元数据，权限、时间等 Web 状态不进入 checksum。 */
export const appDetailToWorkflowDocumentApp = (
  appDetail: Pick<AppDetailType, '_id' | 'name' | 'intro' | 'type'>
): WorkflowDocument['app'] => ({
  appId: String(appDetail._id),
  name: appDetail.name,
  intro: appDetail.intro,
  appType: appDetail.type
});
