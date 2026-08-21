export type AgentLoopProviderName = 'fastAgent' | 'piAgent';

import type { AgentLoopInput } from './input';
import type { AgentLoopResult } from './result';
import type { AgentLoopRuntime } from './runtime';

/** Provider 实现必须遵守的统一 Agent Loop 执行端口。 */
export type AgentLoopProvider = {
  name: AgentLoopProviderName;
  run: <TChildrenResponse = unknown>(params: {
    input: AgentLoopInput<TChildrenResponse>;
    runtime: AgentLoopRuntime<TChildrenResponse>;
  }) => Promise<AgentLoopResult<TChildrenResponse>>;
};
