import type { AgentLoopInput, AgentLoopResult, AgentLoopRuntime } from './type';
import type { AgentLoopProviderName } from './type';
import { getAgentLoopProvider } from './providers/registry';

export type RunAgentLoopParams<TChildrenResponse = unknown> = {
  provider?: AgentLoopProviderName;
  input: AgentLoopInput<TChildrenResponse>;
  runtime: AgentLoopRuntime<TChildrenResponse>;
};

/**
 * Agent Loop 顶层统一入口。业务层只选择 provider，不直接 import 具体 loop 实现。
 */
export const runAgentLoop = async <TChildrenResponse = unknown>({
  provider,
  input,
  runtime
}: RunAgentLoopParams<TChildrenResponse>): Promise<AgentLoopResult<TChildrenResponse>> => {
  const resolvedProvider = getAgentLoopProvider(provider);
  return resolvedProvider.run({
    input,
    runtime
  }) as Promise<AgentLoopResult<TChildrenResponse>>;
};
