import { runAgentLoopApplication } from '../application/run';
import type {
  AgentLoopInput,
  AgentLoopProviderName,
  AgentLoopResult,
  AgentLoopRuntime
} from '../domain';
import { getAgentLoopProvider } from '../provider/registry';

export type RunAgentLoopParams<TChildrenResponse = unknown> = {
  provider?: AgentLoopProviderName;
  input: AgentLoopInput<TChildrenResponse>;
  runtime: AgentLoopRuntime<TChildrenResponse>;
};

/**
 * Agent Loop 唯一公共执行入口，在组合根中完成 provider 选择。
 * 调用方只依赖稳定协议，不感知具体 provider 的目录与实现细节。
 */
export const runAgentLoop = <TChildrenResponse = unknown>({
  provider,
  input,
  runtime
}: RunAgentLoopParams<TChildrenResponse>): Promise<AgentLoopResult<TChildrenResponse>> =>
  runAgentLoopApplication({
    provider: getAgentLoopProvider(provider),
    input,
    runtime
  });
