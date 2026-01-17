import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { SkillToolType } from '@fastgpt/global/core/ai/skill/type';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config';
import type { GetSubAppInfoFnType, SubAppRuntimeType } from './type';
import { agentSkillToToolRuntime } from './sub/tool/utils';
import { readFileTool } from './sub/file/utils';
import { PlanAgentTool } from './sub/plan/constants';
import { datasetSearchTool, type DatasetSearchToolConfig } from './sub/dataset/utils';
import { SubAppIds, systemSubInfo } from './sub/constants';

/* 
  匹配 {{@toolId@}}，转化成: @name 的格式。
*/
export const parseSystemPrompt = ({
  systemPrompt,
  getSubAppInfo
}: {
  systemPrompt?: string;
  getSubAppInfo: (id: string) => {
    name: string;
    avatar: string;
    toolDescription: string;
  };
}): string => {
  if (!systemPrompt) return '';

  // Match pattern {{@toolId@}} and convert to @name format
  const pattern = /\{\{@([^@]+)@\}\}/g;

  const processedPrompt = systemPrompt.replace(pattern, (match, toolId) => {
    const toolInfo = getSubAppInfo(toolId);
    if (!toolInfo) {
      console.warn(`Tool not found for ID: ${toolId}`);
      return match; // Return original match if tool not found
    }

    return `@${toolInfo.name}`;
  });

  return processedPrompt;
};

export const getSubapps = async ({
  tmbId,
  tools,
  lang,
  getPlanTool,
  datasetConfig,
  fileSelectConfig
}: {
  tmbId: string;
  tools: SkillToolType[];
  lang?: localeType;
  getPlanTool?: Boolean;
  datasetConfig?: DatasetSearchToolConfig;
  fileSelectConfig?: AppFileSelectConfigType;
}): Promise<{
  completionTools: ChatCompletionTool[];
  subAppsMap: Map<string, SubAppRuntimeType>;
}> => {
  const subAppsMap = new Map<string, SubAppRuntimeType>();
  const completionTools: ChatCompletionTool[] = [];

  /* Plan */
  if (getPlanTool) {
    completionTools.push(PlanAgentTool);
  }
  /* File */
  const isFileUploadEnabled =
    fileSelectConfig?.canSelectFile ||
    fileSelectConfig?.canSelectImg ||
    fileSelectConfig?.canSelectVideo ||
    fileSelectConfig?.canSelectAudio ||
    fileSelectConfig?.canSelectCustomFileExtension;
  if (isFileUploadEnabled) {
    completionTools.push(readFileTool);
  }

  /* Dataset Search */
  if (datasetConfig && datasetConfig.datasets && datasetConfig.datasets.length > 0) {
    completionTools.push(datasetSearchTool);
    subAppsMap.set(SubAppIds.datasetSearch, {
      type: 'tool',
      id: SubAppIds.datasetSearch,
      name: systemSubInfo[SubAppIds.datasetSearch].name,
      avatar: systemSubInfo[SubAppIds.datasetSearch].avatar,
      params: datasetConfig
    });
  }

  /* System tool */
  const formatTools = await agentSkillToToolRuntime({
    tools,
    tmbId,
    lang
  });
  formatTools.forEach((tool) => {
    completionTools.push(tool.requestSchema);
    subAppsMap.set(tool.id, {
      type: 'tool',
      id: tool.id,
      name: tool.name,
      avatar: tool.avatar,
      version: tool.version,
      toolConfig: tool.toolConfig,
      params: tool.params
    });
  });

  return {
    completionTools,
    subAppsMap
  };
};
