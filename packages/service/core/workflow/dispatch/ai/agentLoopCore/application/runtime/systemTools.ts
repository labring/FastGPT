import type {
  AgentLoopReadFileExecutor,
  AgentLoopSystemTools
} from '../../../../../../ai/llm/agentLoop/domain/tool';
import type { SandboxClient } from '../../../../../../ai/sandbox/application/runtime/client';
import type { AgentLoopDatasetSearchExecutor } from '../../../../../../ai/llm/agentLoop/domain/systemTool/datasetSearch';
import { getErrText } from '@fastgpt/global/common/error/utils';
import {
  isModerationBlockErrorMessage,
  MODERATION_BLOCKED_REPLACE_TEXT
} from '@fastgpt/global/core/plugin/moderation/constants';
import {
  checkToolResultModeration,
  isToolResultModerated,
  markToolResultModerated,
  sanitizeModeratedToolNodeResponse
} from '../../../../../../plugin/moderation/modelInput';
import type { CheckContentByPolicyParams } from '@fastgpt/global/core/plugin/moderation/type';

export type CreateAgentLoopCoreSystemToolsParams = {
  planEnabled: boolean;
  askEnabled: boolean;
  sandboxClient?: SandboxClient;
  readFile?: {
    enabled: boolean;
    maxFileAmount: number;
    execute: AgentLoopReadFileExecutor;
  };
  datasetSearch?: {
    enabled: boolean;
    execute: AgentLoopDatasetSearchExecutor;
    currentInputFiles?: string[];
  };
};

/**
 * 统一拼装 agent-loop systemTools。
 *
 * plan/ask 是控制类 system tool，由节点能力决定是否开启；
 * sandbox 在提供 client 时注入；readFile/datasetSearch 在启用并提供执行器时注入。
 */
export const createAgentLoopCoreSystemTools = (
  {
    planEnabled,
    askEnabled,
    sandboxClient,
    readFile,
    datasetSearch
  }: CreateAgentLoopCoreSystemToolsParams,
  context?: CheckContentByPolicyParams['context']
): AgentLoopSystemTools => ({
  plan: {
    enabled: planEnabled
  },
  ask: {
    enabled: askEnabled
  },
  ...(sandboxClient
    ? {
        sandbox: {
          enabled: true,
          client: sandboxClient
        }
      }
    : {}),
  ...(readFile?.enabled
    ? {
        readFile: {
          enabled: true,
          maxFileAmount: readFile.maxFileAmount,
          execute: async (params) => {
            const res = await readFile.execute(params);
            if (!isToolResultModerated(res)) {
              const originalResponse = res.response;
              const moderatedResponse = originalResponse
                ? await checkToolResultModeration({
                    response: originalResponse,
                    context
                  })
                : originalResponse;
              const hitModeration =
                moderatedResponse !== originalResponse ||
                (res.error !== undefined && isModerationBlockErrorMessage(getErrText(res.error)));
              if (hitModeration) {
                res.response = MODERATION_BLOCKED_REPLACE_TEXT;
                res.error = undefined;
                res.metadata = sanitizeModeratedToolNodeResponse(res.metadata);
              }
              markToolResultModerated(res);
            }
            return res;
          }
        }
      }
    : {}),
  ...(datasetSearch?.enabled
    ? {
        datasetSearch: {
          enabled: true,
          currentInputFiles: datasetSearch.currentInputFiles,
          execute: async (params) => {
            const res = await datasetSearch.execute(params);
            if (!isToolResultModerated(res)) {
              const originalResponse = res.response;
              const moderatedResponse = originalResponse
                ? await checkToolResultModeration({
                    response: originalResponse,
                    context
                  })
                : originalResponse;
              const hitModeration =
                moderatedResponse !== originalResponse ||
                (res.error !== undefined && isModerationBlockErrorMessage(getErrText(res.error)));
              if (hitModeration) {
                res.response = MODERATION_BLOCKED_REPLACE_TEXT;
                res.error = undefined;
                res.metadata = sanitizeModeratedToolNodeResponse(res.metadata);
              }
              markToolResultModerated(res);
            }
            return res;
          }
        }
      }
    : {})
});
