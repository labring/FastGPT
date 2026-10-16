import { workflowBuilderSystemTemplates } from '@fastgpt/global/core/workflow/template/constants';
import { getAutomationMeta } from '@fastgpt/global/core/workflow/template/automationMeta';
import {
  WorkflowTemplateBundleSchema,
  type WorkflowTemplateBundle
} from '@fastgpt/global/core/workflow/template/type';
import { createTranslator } from '../../../i18n/workflowTemplate';

/**
 * 宿主统一装配系统节点与已授权的外部模板，翻译展示字段并附上已校验的资源默认值。
 * 返回纯 JSON 契约，供服务端和沙箱 CLI 直接使用；隐藏模板仍保留以兼容容器和历史节点。
 */
export const createWorkflowTemplateBundle = ({
  locale,
  items = [],
  inputDefaults = {}
}: {
  locale: string;
  items?: WorkflowTemplateBundle['items'];
  inputDefaults?: Record<
    string,
    NonNullable<WorkflowTemplateBundle['items'][number]['validatedInputDefaults']>
  >;
}): WorkflowTemplateBundle => {
  const translate = createTranslator(locale);
  const systemItems = workflowBuilderSystemTemplates.map(({ templateId, template }) => {
    const automationMeta = getAutomationMeta(`builtin:${templateId}`);
    return {
      ref: { kind: 'builtin' as const, templateId },
      template,
      automationMeta,
      listed: automationMeta?.availableForWorkflowBuilder !== false && !templateId.startsWith('__'),
      validatedInputDefaults: inputDefaults[`builtin:${templateId}`]
    };
  });

  // Web 专用的函数属性不参与离线执行，先 JSON 化以保持原模板序列化行为。
  const bundle = WorkflowTemplateBundleSchema.parse(
    JSON.parse(
      JSON.stringify({
        schemaVersion: 'fastgpt-workflow-template-bundle/v1',
        items: [...systemItems, ...items]
      })
    )
  );
  return {
    ...bundle,
    items: bundle.items.map((item) => ({
      ...item,
      template: {
        ...item.template,
        name: translate(item.template.name),
        intro: item.template.intro ? translate(item.template.intro) : item.template.intro,
        inputs: item.template.inputs.map((input) => ({
          ...input,
          label: translate(input.label),
          description: input.description ? translate(input.description) : undefined,
          placeholder: input.placeholder ? translate(input.placeholder) : undefined,
          debugLabel: input.debugLabel ? translate(input.debugLabel) : undefined,
          toolDescription: input.toolDescription ? translate(input.toolDescription) : undefined,
          list: input.list?.map((option) => ({
            ...option,
            label: option.label ? translate(option.label) : option.label,
            description: option.description ? translate(option.description) : undefined
          }))
        })),
        outputs: item.template.outputs.map((output) => ({
          ...output,
          label: output.label ? translate(output.label) : output.label,
          description: output.description ? translate(output.description) : undefined
        }))
      },
      automationMeta: item.automationMeta
        ? {
            ...item.automationMeta,
            inputs: item.automationMeta.inputs
              ? Object.fromEntries(
                  Object.entries(item.automationMeta.inputs).map(([key, meta]) => [
                    key,
                    { ...meta, agentHint: meta.agentHint ? translate(meta.agentHint) : undefined }
                  ])
                )
              : undefined
          }
        : undefined
    }))
  };
};
