import type {
  AgentLoopRuntime,
  AgentLoopUsage
} from '../../../../../../ai/llm/agentLoop/interface';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import {
  createAgentLoopCoreSystemTools,
  type CreateAgentLoopCoreSystemToolsParams
} from './systemTools';
import {
  createAgentLoopCoreToolRuntime,
  type CreateAgentLoopCoreToolRuntimeParams
} from './toolRuntime';
import { agentLoopUsagesToChatNodeUsages } from '../../adapter/usage';

export type CreateAgentLoopCoreRuntimeParams<TChildrenResponse = unknown> = Omit<
  AgentLoopRuntime<TChildrenResponse>,
  | 'systemTools'
  | 'toolCatalog'
  | 'executeTool'
  | 'executeInteractiveTool'
  | 'usagePush'
  | 'emitEvent'
> & {
  systemTools: CreateAgentLoopCoreSystemToolsParams;
  toolRuntime: CreateAgentLoopCoreToolRuntimeParams<TChildrenResponse>;
  usagePush?: (usages: ChatNodeUsageType[]) => void;
  emitEvent?: AgentLoopRuntime<TChildrenResponse>['emitEvent'];
};

/**
 * 统一组装 agent-loop runtime。
 *
 * 调用方仍负责准备节点专属的 LLM 参数、system tool executor、ToolProvider 和事件副作用；
 * core 在这里把 systemTools、toolRuntime、usage 归一化和 emitEvent 拼成稳定 runtime。
 */
export const createAgentLoopCoreRuntime = <TChildrenResponse = unknown>({
  systemTools,
  toolRuntime,
  usagePush,
  emitEvent,
  ...runtime
}: CreateAgentLoopCoreRuntimeParams<TChildrenResponse>): AgentLoopRuntime<TChildrenResponse> => {
  const pushUsages = (usages?: AgentLoopUsage[]) => {
    const chatNodeUsages = agentLoopUsagesToChatNodeUsages(usages);
    if (chatNodeUsages.length > 0) {
      usagePush?.(chatNodeUsages);
    }
  };

  return {
    ...runtime,
    systemTools: createAgentLoopCoreSystemTools(systemTools),
    ...createAgentLoopCoreToolRuntime(toolRuntime),
    usagePush: pushUsages,
    emitEvent
  };
};
