import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { SANDBOX_ICON, SANDBOX_NAME } from '@fastgpt/global/core/ai/sandbox/constants';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { runSandboxTools } from '../../../../../../ai/sandbox/toolCall';
import type { DispatchSubAppResponse } from '../../type';

export const dispatchSandboxTool = async ({
  toolName,
  rawArgs,
  appId,
  userId,
  chatId,
  lang
}: {
  toolName: string;
  rawArgs: string;
  appId: string;
  userId: string;
  chatId: string;
  lang?: localeType;
}): Promise<DispatchSubAppResponse> => {
  const { input, response } = await runSandboxTools({
    toolName,
    args: rawArgs,
    appId,
    userId,
    chatId
  });

  return {
    response,
    nodeResponse: {
      moduleType: FlowNodeTypeEnum.tool,
      moduleName: parseI18nString(SANDBOX_NAME, lang),
      moduleLogo: SANDBOX_ICON,
      toolId: toolName,
      toolInput: input,
      toolRes: response
    }
  };
};

// Agent Skills re-exports
export type { AgentSandboxContext } from './types';
export {
  createAgentSandbox,
  releaseAgentSandbox,
  connectEditDebugSandbox,
  disconnectEditDebugSandbox
} from './lifecycle';
export {
  dispatchSandboxReadFile,
  dispatchSandboxWriteFile,
  dispatchSandboxEditFile,
  dispatchSandboxExecute,
  dispatchSandboxSearch
} from './skill';
export { buildSkillsContextPrompt } from './prompt';
