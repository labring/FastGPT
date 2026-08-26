import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { AppTemplateSchemaType } from '@fastgpt/global/core/app/type';
import { migrateWorkflowToCurrent } from '@fastgpt/global/core/workflow/migration';

/**
 * 将模板内的历史工作流迁移为当前结构。
 *
 * 高级应用和工作流工具会迁移完整节点、连线与聊天配置；简易应用没有节点工作流，
 * 仅复用同一迁移器清理 chatConfig。未知模板类型保持原样，避免模板市场被单条外部数据拖垮。
 */
export const migrateAppTemplateWorkflowToCurrent = (
  template: AppTemplateSchemaType
): AppTemplateSchemaType => {
  if (!template.workflow || typeof template.workflow !== 'object') return template;

  if (template.type === AppTypeEnum.simple) {
    const workflow = template.workflow as unknown as Record<string, unknown>;
    const migrated = migrateWorkflowToCurrent({
      nodes: [],
      edges: [],
      chatConfig: workflow.chatConfig
    });

    return {
      ...template,
      workflow: {
        ...workflow,
        chatConfig: migrated.chatConfig
      } as AppTemplateSchemaType['workflow']
    };
  }

  if (template.type !== AppTypeEnum.workflow && template.type !== AppTypeEnum.workflowTool) {
    return template;
  }

  const workflow = template.workflow as unknown as Record<string, unknown>;
  const migrated = migrateWorkflowToCurrent({
    nodes: Array.isArray(workflow.nodes) ? workflow.nodes : [],
    edges: workflow.edges,
    chatConfig: workflow.chatConfig
  });

  return {
    ...template,
    workflow: migrated
  };
};
