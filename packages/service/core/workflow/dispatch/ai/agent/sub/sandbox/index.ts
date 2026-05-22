import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { SANDBOX_ICON, SANDBOX_NAME } from '@fastgpt/global/core/ai/sandbox/tools';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { runSandboxTools } from '../../../../../../ai/sandbox/toolCall';
import type { DispatchSubAppResponse } from '../../type';
import type { SandboxClient } from '../../../../../../ai/sandbox/service/runtime';

export const dispatchSandboxTool = async ({
  toolName,
  rawArgs,
  appId,
  userId,
  chatId,
  lang,
  sandboxClient
}: {
  toolName: string;
  rawArgs: string;
  appId: string;
  userId: string;
  chatId: string;
  lang?: localeType;
  sandboxClient?: SandboxClient;
}): Promise<DispatchSubAppResponse> => {
  const { input, response } = await runSandboxTools({
    toolName,
    args: rawArgs,
    appId,
    userId,
    chatId,
    sandboxClient
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

export { useSandbox } from './useSandbox';
