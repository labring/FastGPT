import { workflowBuilderSystemTemplates } from '@fastgpt/global/core/workflow/template/constants';
import { getAutomationMeta } from '@fastgpt/global/core/workflow/template/automationMeta';
import { createWorkflowTemplateBundleProvider } from '../../src/template/provider';

/** Core 测试显式注入 Global 模板，生产引擎不携带默认 Provider。 */
export const builtinTemplateProvider = createWorkflowTemplateBundleProvider({
  schemaVersion: 'fastgpt-workflow-template-bundle/v1',
  items: workflowBuilderSystemTemplates.map(({ templateId, template }) => {
    const automationMeta = getAutomationMeta(`builtin:${templateId}`);
    return {
      ref: { kind: 'builtin', templateId },
      template: JSON.parse(JSON.stringify(template)),
      automationMeta,
      listed: automationMeta?.availableForWorkflowBuilder !== false && !templateId.startsWith('__')
    };
  })
});

export const builtinTemplateRefs = workflowBuilderSystemTemplates
  .filter(
    ({ templateId }) =>
      getAutomationMeta(`builtin:${templateId}`)?.availableForWorkflowBuilder !== false &&
      !templateId.startsWith('__')
  )
  .map(({ templateId }) => ({ kind: 'builtin' as const, templateId }));
