import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { SkillToolType } from '@fastgpt/global/core/ai/skill/type';
import type { InteractiveNodeResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { SubAppRuntimeType } from './type';
import { getAgentRuntimeTools } from './sub/tool/utils';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { readFileTool } from './sub/file/utils';
import { PlanAgentTool } from './sub/plan/constants';
import { datasetSearchTool } from './sub/dataset/utils';
import { SANDBOX_TOOLS } from '@fastgpt/global/core/ai/sandbox/constants';

export const getSubapps = async ({
  tmbId,
  tools,
  lang,
  getPlanTool,
  hasDataset,
  hasFiles,
  useAgentSandbox
}: {
  tmbId: string;
  tools: SkillToolType[];
  lang?: localeType;
  getPlanTool?: Boolean;
  hasDataset?: boolean;
  hasFiles: boolean;
  useAgentSandbox: boolean;
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

  /* Sandbox Shell */
  if (useAgentSandbox) {
    completionTools.push(...SANDBOX_TOOLS);
  }

  /* System tool */
  const formatTools = await getAgentRuntimeTools({
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
  interactive?: InteractiveNodeResponseType;
  queryInput: string;
}): { question?: string; answer?: string } | undefined => {
  if (!interactive) return;

  if (interactive.type === 'agentPlanAskQuery') {
    const question = interactive.params?.content?.trim();
    if (!question) return;

    const answer = interactive.params?.answer?.trim() || queryInput.trim() || undefined;

    return {
      question,
      answer
    };
  }

  if (interactive.type !== 'agentPlanAskUserForm') return;

  const question = interactive.params?.description?.trim();
  if (!question) return;

  const formAnswer =
    interactive.params?.inputForm?.map((item) => `- ${item.label}: ${item.value}`).join('\n') || '';

  const answer = formAnswer || queryInput.trim() || undefined;

  return {
    question,
    answer
  };
};
