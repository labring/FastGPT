import { runAgentLoopApplication } from '../application/run';
import type { AgentLoopInput, AgentLoopResult, AgentLoopRuntime } from '../domain';
import { fastAgentProvider } from '../provider/fastAgent';

export type RunAgentLoopParams<TChildrenResponse = unknown> = {
  input: AgentLoopInput<TChildrenResponse>;
  runtime: AgentLoopRuntime<TChildrenResponse>;
};

/**
 * Agent Loop 唯一公共执行入口，统一委托内置 fastAgent 执行。
 * 调用方只依赖稳定协议，不感知底层 loop 的目录与实现细节。
 */
export const runAgentLoop = <TChildrenResponse = unknown>({
  input,
  runtime
}: RunAgentLoopParams<TChildrenResponse>): Promise<AgentLoopResult<TChildrenResponse>> =>
  runAgentLoopApplication({
    provider: fastAgentProvider,
    input,
    runtime
  });
