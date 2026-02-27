import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { SkillToolType } from '@fastgpt/global/core/ai/skill/type';
import type { SubAppRuntimeType } from './type';
import { getAgentRuntimeTools } from './sub/tool/utils';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { readFileTool } from './sub/file/utils';
import { PlanAgentTool } from './sub/plan/constants';
import { datasetSearchTool } from './sub/dataset/utils';
import { SANDBOX_TOOLS } from '@fastgpt/global/core/ai/sandbox/constants';
import { allSandboxTools } from '@fastgpt/global/core/workflow/node/agent/sandboxTools';

export const getSubapps = async ({
  tmbId,
  tools,
  lang,
  getPlanTool,
  hasDataset,
  hasFiles,
  useAgentSandbox,
  hasSandboxSkills
}: {
  tmbId: string;
  tools: SkillToolType[];
  lang?: localeType;
  getPlanTool?: Boolean;
  hasDataset?: boolean;
  hasFiles: boolean;
  useAgentSandbox?: boolean;
  hasSandboxSkills?: boolean;
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

  /* Sandbox Shell (Computer Use) */
  if (useAgentSandbox) {
    completionTools.push(...SANDBOX_TOOLS);
  }

  /* Sandbox Skills (Agent Skills) */
  if (hasSandboxSkills) {
    completionTools.push(...allSandboxTools);
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
