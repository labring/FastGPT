import type { SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import {
  getToolConfigStatus,
  initAgentToolInputType
} from '@fastgpt/global/core/app/formEdit/utils';
import { AgentToolInputModeEnum } from '@fastgpt/global/core/app/tool/constants';
import { AgentToolSchema } from '@fastgpt/global/core/app/tool/type';
import { isSystemOrCommercialToolId } from '@fastgpt/global/core/app/tool/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getClientToolPreviewNode } from '@/web/core/app/api/tool';

/**
 * 将导入/旧数据中的 canonical 紧凑 Agent 工具补全为可编辑的完整工具定义。
 *
 * 紧凑工具只有 `inputs[key].mode` 和 `config`，缺少 flowNodeType、完整 IO 等编辑态字段。
 * 这里按服务端详情装配的同口径加载预览定义，并把保存的 mode/config 合并回输入；
 * 工具已删除/无权限时向上抛错，由调用方提示，不静默丢弃。
 */
export const hydrateAgentToolForEdit = async ({
  tool,
  lang
}: {
  tool: SelectedToolItemType;
  lang: string;
}): Promise<SelectedToolItemType> => {
  const parsed = AgentToolSchema.safeParse(tool);
  if (!parsed.success) {
    throw new Error('Invalid agent tool');
  }

  const canonicalTool = parsed.data;
  const preview = await getClientToolPreviewNode({
    appId: canonicalTool.id,
    // 空字符串表示保持最新版本；preview 接口要求 versionId 或 getLatestVersion 二选一。
    versionId: canonicalTool.version ?? '',
    source: canonicalTool.source,
    lang: (canonicalTool.metadataLocale ?? lang) as localeType
  });

  const savedInputs = canonicalTool.inputs ?? [];
  const hasMissingToolInputs = canonicalTool.inputs === undefined;
  const savedModeMap = new Map(savedInputs.map((input) => [input.key, input.mode]));

  const inputs = preview.inputs.map((input) => {
    const savedMode = savedModeMap.get(input.key);
    const mode = Object.values(AgentToolInputModeEnum).includes(savedMode as AgentToolInputModeEnum)
      ? (savedMode as AgentToolInputModeEnum)
      : hasMissingToolInputs &&
          (isSystemOrCommercialToolId(canonicalTool.id) ||
            (preview.flowNodeType === FlowNodeTypeEnum.pluginModule && !!input.toolDescription))
        ? AgentToolInputModeEnum.agentGenerated
        : undefined;

    const inputWithType = initAgentToolInputType({ input, mode });
    return {
      ...inputWithType,
      value:
        canonicalTool.config[input.key] !== undefined
          ? canonicalTool.config[input.key]
          : inputWithType.value
    };
  });

  const savedMcpToolSet = canonicalTool.toolConfig?.mcpToolSet;
  const savedHttpToolSet = canonicalTool.toolConfig?.httpToolSet;
  const shouldUsePreviewToolConfig =
    (savedMcpToolSet && 'toolId' in savedMcpToolSet) ||
    (savedHttpToolSet && 'toolId' in savedHttpToolSet);
  // 与详情接口一致：不把预览回退语言写成 metadataLocale，只有保存过才恢复。
  const { metadataLocale: previewMetadataLocale, ...previewTool } = preview;
  void previewMetadataLocale;

  const hydratedTool = {
    ...previewTool,
    id: canonicalTool.id,
    // 与 selectedTools 中已保存项的规范化身份保持一致，避免确认后 replace 失败而追加重复工具。
    pluginId: canonicalTool.id,
    name: canonicalTool.name ?? preview.name,
    avatar: canonicalTool.avatar ?? preview.avatar,
    version: canonicalTool.version ?? preview.version,
    source: canonicalTool.source ?? preview.source,
    // 与详情接口一致：不把预览回退语言写成 metadataLocale，只有保存过才恢复。
    ...(canonicalTool.metadataLocale !== undefined
      ? { metadataLocale: canonicalTool.metadataLocale }
      : {}),
    toolConfig: shouldUsePreviewToolConfig
      ? preview.toolConfig
      : (canonicalTool.toolConfig ?? preview.toolConfig),
    inputs,
    config: canonicalTool.config,
    configStatus: 'configured' as const
  } satisfies SelectedToolItemType;

  return {
    ...hydratedTool,
    configStatus: getToolConfigStatus({ tool: hydratedTool }).status
  };
};
