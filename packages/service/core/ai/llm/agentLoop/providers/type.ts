import type {
  AgentLoopInput,
  AgentLoopProviderName,
  AgentLoopResult,
  AgentLoopRuntime
} from '../type';

export type AgentLoopProvider = {
  name: AgentLoopProviderName;
  run: <TChildrenResponse = unknown>(params: {
    input: AgentLoopInput<TChildrenResponse>;
    runtime: AgentLoopRuntime<TChildrenResponse>;
  }) => Promise<AgentLoopResult<TChildrenResponse>>;
};
