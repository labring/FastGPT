import type { AgentLoopSystemTools } from '../../../../../../ai/llm/agentLoop/interface';
import type { SandboxClient } from '../../../../../../ai/sandbox/interface/runtime';
import type { AgentLoopDatasetSearchExecutor } from '../../../../../../ai/llm/agentLoop/interface';
import type { AgentLoopReadFileExecutor } from '../../../../../../ai/llm/agentLoop/interface';

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
 * sandbox/readFile/datasetSearch 是普通工具类 system tool，只有调用方提供执行器时才注入。
 */
export const createAgentLoopCoreSystemTools = ({
  planEnabled,
  askEnabled,
  sandboxClient,
  readFile,
  datasetSearch
}: CreateAgentLoopCoreSystemToolsParams): AgentLoopSystemTools => ({
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
          execute: readFile.execute
        }
      }
    : {}),
  ...(datasetSearch?.enabled
    ? {
        datasetSearch: {
          enabled: true,
          execute: datasetSearch.execute,
          currentInputFiles: datasetSearch.currentInputFiles
        }
      }
    : {})
});
