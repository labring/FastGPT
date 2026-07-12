import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { SANDBOX_ICON, SANDBOX_NAME } from '@fastgpt/global/core/ai/sandbox/tools';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { runSandboxTools } from '../../../../../../ai/sandbox/interface/toolCall';
import type { DispatchSubAppResponse } from '../../type';
import type { SandboxClient } from '../../../../../../ai/sandbox/interface/runtime';

/**
 * Agent 子工具层的 sandbox tool 适配器。
 *
 * 真实工具执行在 ai/sandbox/toolCall 中完成，这里只补齐 Agent runtime 需要的
 * nodeResponse 元数据，和其他 sub app/tool dispatch 保持同一返回结构。
 */
export const dispatchSandboxTool = async ({
  toolName,
  rawArgs,
  lang,
  sandboxClient
}: {
  toolName: string;
  rawArgs: string;
  lang?: localeType;
  sandboxClient: SandboxClient;
}): Promise<DispatchSubAppResponse> => {
  const { input, response } = await runSandboxTools({
    toolName,
    args: rawArgs,
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
