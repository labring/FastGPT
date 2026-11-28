import type { AgentLoopInput } from './input';
import type { AgentLoopResult } from './result';
import type { AgentLoopRuntime } from './runtime';

/** Agent Loop 底层执行端口（供 application 层组合与单测注入）。 */
export type AgentLoopProvider = {
  name: 'fastAgent';
  run: <TChildrenResponse = unknown>(params: {
    input: AgentLoopInput<TChildrenResponse>;
    runtime: AgentLoopRuntime<TChildrenResponse>;
  }) => Promise<AgentLoopResult<TChildrenResponse>>;
};
