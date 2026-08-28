import {
  FlowNodeTypeEnum,
  isNestedParentNodeType
} from '@fastgpt/global/core/workflow/node/constant';
import type { WorkflowDocument } from '../domain/document';
import { createWorkflowDocument } from '../domain/document';
import type { WorkflowDiagnostic } from '../domain/diagnostic';
import { syncWorkflowStartFileOutput } from '../config/service';
import { assertParentAssignment, syncContainerChildren } from '../nesting/service';
import { instantiateNodeFromTemplate } from '../template/instantiate';
import type { NodeTemplateRef, WorkflowTemplateProvider } from '../template/type';

export type AddNodeDependencies = {
  templateProvider: WorkflowTemplateProvider;
  locale?: string;
  translate?: (value: string) => string;
};

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

/** 创建完整节点；容器会在同一事务内生成必需的系统子节点。 */
export const addNodeFromTemplate = async ({
  document,
  template,
  nodeId,
  name,
  position,
  parentNodeId,
  dependencies
}: {
  document: WorkflowDocument;
  template: NodeTemplateRef;
  nodeId: string;
  name?: string;
  position?: { x: number; y: number };
  parentNodeId?: string;
  dependencies: AddNodeDependencies;
}): Promise<{ nodeIds: string[]; warnings: WorkflowDiagnostic[] }> => {
  const instantiate = (params: {
    templateRef: NodeTemplateRef;
    childNodeId: string;
    childPosition?: { x: number; y: number };
    childParentNodeId?: string;
    childName?: string;
  }) =>
    instantiateNodeFromTemplate({
      document,
      templateRef: params.templateRef,
      nodeId: params.childNodeId,
      name: params.childName,
      position: params.childPosition,
      parentNodeId: params.childParentNodeId,
      provider: dependencies.templateProvider,
      locale: dependencies.locale ?? 'en',
      translate: dependencies.translate
    });

  const instantiated = await instantiate({
    templateRef: template,
    childNodeId: nodeId,
    childPosition: position,
    childParentNodeId: parentNodeId,
    childName: name
  });
  assertParentAssignment({ document, node: instantiated.node, parentNodeId });
  document.nodes.push(instantiated.node);
  // 配置可能先于 Start 创建，插入后重新同步动态文件输出，避免命令顺序影响最终文档。
  if (instantiated.node.flowNodeType === FlowNodeTypeEnum.workflowStart) {
    syncWorkflowStartFileOutput({
      document,
      fileSelectConfig: document.chatConfig.fileSelectConfig
    });
  }

  const nodeIds = [nodeId];
  const warnings = [...instantiated.warnings];
  if (parentNodeId) syncContainerChildren(document, parentNodeId);

  if (!isNestedParentNodeType(instantiated.node.flowNodeType)) {
    return { nodeIds, warnings };
  }

  const systemTemplates =
    instantiated.node.flowNodeType === FlowNodeTypeEnum.loopRun
      ? [{ templateId: '__loop-run-start', suffix: 'start', offset: { x: 60, y: 280 } }]
      : [
          { templateId: '__nested-start', suffix: 'start', offset: { x: 60, y: 280 } },
          { templateId: '__nested-end', suffix: 'end', offset: { x: 420, y: 680 } }
        ];

  for (const systemTemplate of systemTemplates) {
    const childNodeId = `${nodeId}__${systemTemplate.suffix}`;
    const child = await instantiate({
      templateRef: { kind: 'builtin', templateId: systemTemplate.templateId },
      childNodeId,
      childPosition: position
        ? { x: position.x + systemTemplate.offset.x, y: position.y + systemTemplate.offset.y }
        : undefined,
      childParentNodeId: nodeId
    });
    assertParentAssignment({
      document,
      node: child.node,
      parentNodeId: nodeId,
      allowSystemChild: true
    });
    document.nodes.push(child.node);
    nodeIds.push(childNodeId);
    warnings.push(...child.warnings);
  }
  syncContainerChildren(document, nodeId);
  return { nodeIds, warnings };
};
