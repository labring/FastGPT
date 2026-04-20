import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import {
  SANDBOX_ICON,
  SANDBOX_NAME,
  SANDBOX_TOOL_NAME,
  SANDBOX_GET_FILE_URL_TOOL_NAME
} from '@fastgpt/global/core/ai/sandbox/constants';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { callSandboxTool } from '../../../../../../ai/sandbox/toolCall';

type SandboxDispatchParams = {
  appId: string;
  userId: string;
  chatId: string;
  lang?: localeType;
};

type SandboxDispatchResult = {
  response: string;
  usages: ChatNodeUsageType[];
  nodeResponse: ChatHistoryItemResType;
};

const buildNodeResponse = ({
  toolId,
  input,
  response,
  durationSeconds,
  lang
}: {
  toolId: string;
  input: Record<string, any>;
  response: string;
  durationSeconds: number;
  lang?: localeType;
}): ChatHistoryItemResType => {
  const nodeId = getNanoid(6);
  return {
    nodeId,
    id: nodeId,
    moduleType: FlowNodeTypeEnum.tool,
    moduleName: parseI18nString(SANDBOX_NAME, lang),
    moduleLogo: SANDBOX_ICON,
    toolId,
    toolInput: input,
    toolRes: response,
    totalPoints: 0,
    runningTime: durationSeconds
  };
};

export const dispatchSandboxShell = async ({
  command,
  timeout,
  appId,
  userId,
  chatId,
  lang
}: SandboxDispatchParams & {
  command: string;
  timeout?: number;
}): Promise<SandboxDispatchResult> => {
  const { input, response, durationSeconds } = await callSandboxTool({
    toolName: SANDBOX_TOOL_NAME,
    rawArgs: JSON.stringify({ command, timeout }),
    appId,
    userId,
    chatId
  });

  return {
    response,
    usages: [],
    nodeResponse: buildNodeResponse({
      toolId: SANDBOX_TOOL_NAME,
      input,
      response,
      durationSeconds,
      lang
    })
  };
};

export const dispatchSandboxGetFileUrl = async ({
  paths,
  appId,
  userId,
  chatId,
  lang
}: SandboxDispatchParams & {
  paths: string[];
}): Promise<SandboxDispatchResult> => {
  const { input, response, durationSeconds } = await callSandboxTool({
    toolName: SANDBOX_GET_FILE_URL_TOOL_NAME,
    rawArgs: JSON.stringify({ paths }),
    appId,
    userId,
    chatId
  });

  return {
    response,
    usages: [],
    nodeResponse: buildNodeResponse({
      toolId: SANDBOX_GET_FILE_URL_TOOL_NAME,
      input,
      response,
      durationSeconds,
      lang
    })
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
