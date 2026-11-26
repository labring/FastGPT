import type { localeType } from '@fastgpt/global/common/i18n/type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { WorkflowTemplateBundle } from '@fastgpt/global/core/workflow/template/type';
import { getTeamModelHandle } from '../../ai/model/catalog/service';
import { getAuthorizedSystemToolTemplateCatalog } from '../../app/tool/systemTool/capability';

const templatesWithDefaultModel = [
  'builtin:ai-chat',
  'builtin:content-extract',
  'builtin:question-classification',
  'builtin:tool-call'
];

/** 读取当前成员可用的完整工具模板和团队模型默认值，供 CLI 和 Pro Builder 组装同格式的模板包。 */
export async function getWorkflowTemplateContext({
  teamId,
  tmbId,
  isRoot,
  locale
}: {
  teamId: string;
  tmbId: string;
  isRoot: boolean;
  locale: localeType;
}) {
  const [systemTools, modelHandle] = await Promise.all([
    getAuthorizedSystemToolTemplateCatalog({ teamId, tmbId, isRoot, lang: locale }),
    getTeamModelHandle({ teamId })
  ]);

  const defaultModelId = (() => {
    try {
      return modelHandle.getDefaultModelData('llm').modelId;
    } catch {
      // 未配置默认模型时保留模板原有的值和绑定提示。
      return undefined;
    }
  })();
  const inputDefaults = defaultModelId
    ? Object.fromEntries(
        templatesWithDefaultModel.map((ref) => [
          ref,
          { [NodeInputKeyEnum.aiModelId]: { provided: true as const, value: defaultModelId } }
        ])
      )
    : undefined;
  const items: WorkflowTemplateBundle['items'] = systemTools.map(
    ({ toolId, source, template }) => ({
      ref: { kind: 'systemTool', toolId, source },
      template
    })
  );

  return { modelHandle, bundleOptions: { locale, items, inputDefaults } };
}
