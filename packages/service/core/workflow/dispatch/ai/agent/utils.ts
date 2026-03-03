import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { SkillToolType } from '@fastgpt/global/core/ai/skill/type';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import type { SubAppRuntimeType } from './type';
import { agentSkillToToolRuntime } from './sub/tool/utils';
import { readFileTool } from './sub/file/utils';
import { PlanAgentTool } from './sub/plan/constants';
import { datasetSearchTool } from './sub/dataset/utils';

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

export const getPlanAskInfoFromInteractive = ({
  interactive,
  queryInput
}: {
  interactive?: unknown;
  queryInput: string;
}): { question?: string; answer?: string } | undefined => {
  if (!interactive || typeof interactive !== 'object') return;

  const interactiveData = interactive as {
    type?: string;
    params?: {
      content?: string;
      description?: string;
      inputForm?: Array<{ label?: string; value?: unknown }>;
    };
  };

  if (interactiveData.type === 'agentPlanAskQuery') {
    const question = interactiveData.params?.content?.trim();
    if (!question) return;

    const answer = queryInput.trim() || undefined;

    return {
      question,
      answer
    };
  }

  if (interactiveData.type !== 'agentPlanAskUserForm') return;

  const question = interactiveData.params?.description?.trim();
  if (!question) return;

  const formAnswer =
    interactiveData.params?.inputForm?.map((item) => `- ${item.label}: ${item.value}`).join('\n') ||
    '';

  const answer = formAnswer || queryInput.trim() || undefined;

  return {
    question,
    answer
  };
};
