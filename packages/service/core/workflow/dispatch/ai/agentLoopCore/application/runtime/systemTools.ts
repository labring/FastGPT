import type {
  AgentLoopReadFileExecutor,
  AgentLoopSystemTools
} from '../../../../../../ai/llm/agentLoop/domain/tool';
import type { SandboxClient } from '../../../../../../ai/sandbox/application/runtime/client';
import type { AgentLoopDatasetSearchExecutor } from '../../../../../../ai/llm/agentLoop/domain/systemTool/datasetSearch';

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
