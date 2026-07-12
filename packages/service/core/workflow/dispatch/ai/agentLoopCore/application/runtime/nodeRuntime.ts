import type { AgentLoopRuntime } from '../../../../../../ai/llm/agentLoop/interface';
import { createAgentLoopCoreRuntime, type CreateAgentLoopCoreRuntimeParams } from './createRuntime';
import {
  createAgentLoopCoreRuntimeEnvironment,
  type AgentLoopCoreRuntimeEnvironment,
  type CreateAgentLoopCoreRuntimeEnvironmentParams
} from './environment';

export type CreateAgentLoopCoreNodeRuntimeParams<TChildrenResponse = unknown> = Omit<
  CreateAgentLoopCoreRuntimeParams<TChildrenResponse>,
  'emitEvent' | 'toolRuntime'
> & {
  environment: CreateAgentLoopCoreRuntimeEnvironmentParams;
  toolRuntime: CreateAgentLoopCoreRuntimeParams<TChildrenResponse>['toolRuntime'];
};

export type CreateAgentLoopCoreRuntimeWithEnvironmentParams<TChildrenResponse = unknown> = Omit<
  CreateAgentLoopCoreRuntimeParams<TChildrenResponse>,
  'emitEvent'
> & {
  environment: AgentLoopCoreRuntimeEnvironment;
};

export type AgentLoopCoreNodeRuntime<TChildrenResponse = unknown> = {
  runtime: AgentLoopRuntime<TChildrenResponse>;
  environment: AgentLoopCoreRuntimeEnvironment;
};

/**
 * 组装 workflow 节点级 agent-loop runtime。
 *
 * 这一层把环境副作用和工具执行结果缓存绑定起来：
 * - Workflow Agent 传 nodeResponses 后，工具执行结果会先缓存，再由 tool_run_end 落平铺运行详情。
 * - ToolCall 开启 collectToolRunResponses 后，工具子流程详情会缓存到同一个 environment。
 *
 * 调用方只需要提供节点能力配置和 ToolProvider，不再重复拼 emitEvent/onToolResult。
 */
export const createAgentLoopCoreRuntimeWithEnvironment = <TChildrenResponse = unknown>({
  environment,
  toolRuntime,
  ...runtimeParams
}: CreateAgentLoopCoreRuntimeWithEnvironmentParams<TChildrenResponse>): AgentLoopRuntime<TChildrenResponse> => {
  return createAgentLoopCoreRuntime<TChildrenResponse>({
    ...runtimeParams,
    toolRuntime: {
      ...toolRuntime,
      onToolResult: (args) => {
        toolRuntime.onToolResult?.(args);
        environment.cacheNodeToolResult({
          callId: args.callId,
          usages: args.result.usages ?? [],
          nodeResponse: args.result.nodeResponse
        });
      }
    },
    emitEvent: environment.emitEvent
  });
};

export const createAgentLoopCoreNodeRuntime = <TChildrenResponse = unknown>({
  environment: environmentParams,
  ...runtimeParams
}: CreateAgentLoopCoreNodeRuntimeParams<TChildrenResponse>): AgentLoopCoreNodeRuntime<TChildrenResponse> => {
  const environment = createAgentLoopCoreRuntimeEnvironment(environmentParams);
  const runtime = createAgentLoopCoreRuntimeWithEnvironment<TChildrenResponse>({
    ...runtimeParams,
    environment
  });

  return {
    runtime,
    environment
  };
};
