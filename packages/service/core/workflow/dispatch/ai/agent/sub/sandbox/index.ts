import { SandboxClient } from '../../../../../../ai/sandbox/controller';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { getLogger, LogCategories } from '../../../../../../../common/logger';
import {
  SANDBOX_ICON,
  SANDBOX_NAME,
  SANDBOX_TOOL_NAME
} from '@fastgpt/global/core/ai/sandbox/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { localeType } from '@fastgpt/global/common/i18n/type';

type SandboxShellParams = {
  command: string;
  timeout?: number;
  appId: string;
  userId: string;
  chatId: string;
  lang?: localeType;
};

export const dispatchSandboxShell = async ({
  command,
  timeout,
  appId,
  userId,
  chatId,
  lang
}: SandboxShellParams): Promise<{
  response: string;
  usages: ChatNodeUsageType[];
  nodeResponse: ChatHistoryItemResType;
}> => {
  const startTime = Date.now();
  const nodeId = getNanoid(6);
  const moduleName = parseI18nString(SANDBOX_NAME, lang);

  try {
    const sandboxInstance = new SandboxClient({
      appId,
      userId,
      chatId
    });

    const result = await sandboxInstance.exec(command, timeout);
    const response = JSON.stringify({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode
    });

    getLogger(LogCategories.MODULE.AI.AGENT).info('[Sandbox Shell] Command executed', {
      command,
      exitCode: result.exitCode,
      stdoutLength: result.stdout?.length || 0,
      stderrLength: result.stderr?.length || 0
    });

    return {
      response,
      usages: [],
      nodeResponse: {
        nodeId,
        id: nodeId,
        moduleType: FlowNodeTypeEnum.tool,
        moduleName,
        moduleLogo: SANDBOX_ICON,
        toolId: SANDBOX_TOOL_NAME,
        toolInput: { command, timeout },
        toolRes: response,
        totalPoints: 0,
        runningTime: +((Date.now() - startTime) / 1000).toFixed(2)
      }
    };
  } catch (error) {
    getLogger(LogCategories.MODULE.AI.AGENT).error('[Sandbox Shell] Execution failed', { error });

    const errorResponse = JSON.stringify({
      stdout: '',
      stderr: getErrText(error),
      exitCode: -1
    });

    return {
      response: errorResponse,
      usages: [],
      nodeResponse: {
        nodeId,
        id: nodeId,
        moduleType: FlowNodeTypeEnum.tool,
        moduleName,
        moduleLogo: SANDBOX_ICON,
        toolInput: { command, timeout },
        toolRes: errorResponse,
        totalPoints: 0,
        runningTime: +((Date.now() - startTime) / 1000).toFixed(2)
      }
    };
  }
};
