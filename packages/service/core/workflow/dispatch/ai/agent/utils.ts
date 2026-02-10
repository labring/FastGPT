import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { SkillToolType } from '@fastgpt/global/core/ai/skill/type';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import type { SubAppRuntimeType } from './type';
import { agentSkillToToolRuntime } from './sub/tool/utils';
import { readFileTool } from './sub/file/utils';
import { PlanAgentTool } from './sub/plan/constants';
import { datasetSearchTool } from './sub/dataset/utils';

type SystemSubAppI18nNameType = Record<localeType, string>;

export const getSystemSubAppDisplayName = ({
  subAppId,
  lang = 'zh-CN'
}: {
  subAppId: string;
  lang?: localeType;
}) => {
  const nameMap: Record<string, SystemSubAppI18nNameType> = {
    [SubAppIds.plan]: {
      'zh-CN': '规划 Agent',
      'zh-Hant': '規劃 Agent',
      en: 'PlanAgent'
    },
    [SubAppIds.fileRead]: {
      'zh-CN': '文件解析',
      'zh-Hant': '文件解析',
      en: 'FileParsing'
    },
    [SubAppIds.datasetSearch]: {
      'zh-CN': '知识库检索',
      'zh-Hant': '知識庫檢索',
      en: 'DatasetSearch'
    }
  };

  const target = nameMap[subAppId];
  if (!target) return '';
  return target[lang];
};

export const getSubapps = async ({
  tmbId,
  tools,
  lang,
  getPlanTool,
  hasDataset,
  hasFiles
}: {
  tmbId: string;
  tools: SkillToolType[];
  lang?: localeType;
  getPlanTool?: Boolean;
  hasDataset?: boolean;
  hasFiles: boolean;
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
  if (hasFiles) {
    completionTools.push(readFileTool);
  }

  /* Dataset Search */
  if (hasDataset) {
    completionTools.push(datasetSearchTool);
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
      type: tool.type,
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
