import type { WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';
import { createWorkflowDocument } from './document';
import type { WorkflowDiagnostic } from './diagnostic';
import { addNodeFromTemplate, type AddNodeDependencies } from '../node/add';

export const WORKFLOW_START_NODE_ID = 'start';

/**
 * @deprecated 系统配置节点已迁移到 chatConfig；保留空操作仅兼容旧调用方。
 */
export const ensureSystemConfigNode = async ({
  document,
  dependencies
}: {
  document: WorkflowDocument;
  dependencies: AddNodeDependencies;
}) => {
  void document;
  void dependencies;
  return { nodeIds: [], warnings: [] as WorkflowDiagnostic[] };
};

/** 创建与 FastGPT Web 默认结构一致的空工作流。 */
export const createDefaultWorkflowDocument = async ({
  app = {},
  dependencies
}: {
  app?: WorkflowDocument['app'];
  dependencies: AddNodeDependencies;
}) => {
  const document = createWorkflowDocument({ app });
  const systemConfigResult = await ensureSystemConfigNode({ document, dependencies });
  const workflowStartResult = await addNodeFromTemplate({
    document,
    template: { kind: 'builtin', templateId: 'workflow-start' },
    nodeId: WORKFLOW_START_NODE_ID,
    position: { x: 560, y: 120 },
    dependencies
  });

  return {
    document,
    nodeIds: [...systemConfigResult.nodeIds, ...workflowStartResult.nodeIds],
    warnings: [...systemConfigResult.warnings, ...workflowStartResult.warnings]
  };
};
