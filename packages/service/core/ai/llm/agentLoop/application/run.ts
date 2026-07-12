import {
  normalizeAgentLoopUsages,
  type AgentLoopInput,
  type AgentLoopProvider,
  type AgentLoopResult,
  type AgentLoopRuntime,
  type AgentLoopUsage
} from '../domain';

export type RunAgentLoopApplicationParams<TChildrenResponse = unknown> = {
  provider: AgentLoopProvider;
  input: AgentLoopInput<TChildrenResponse>;
  runtime: AgentLoopRuntime<TChildrenResponse>;
};

/**
 * Agent Loop 顶层统一入口。业务层只选择 provider，不直接 import 具体 loop 实现。
 *
 * provider 产生 usage 时仍只调用一次 `runtime.usagePush`。这里在转发账单回调的同时
 * 收集同一批 usage，并将其作为只读 result 返回，避免 provider 另行拼装汇总后遗漏
 * 工具/压缩用量，或由业务层为了补汇总再次触发计费。
 */
export const runAgentLoopApplication = async <TChildrenResponse = unknown>({
  provider,
  input,
  runtime
}: RunAgentLoopApplicationParams<TChildrenResponse>): Promise<
  AgentLoopResult<TChildrenResponse>
> => {
  const pushedUsages: AgentLoopUsage[] = [];
  try {
    const result = await provider.run({
      input,
      runtime: {
        ...runtime,
        usagePush: (usages) => {
          const normalizedUsages = normalizeAgentLoopUsages(usages);
          pushedUsages.push(...normalizedUsages);
          runtime.usagePush?.(normalizedUsages);
        }
      }
    });

    return {
      ...result,
      usages: pushedUsages.length > 0 ? pushedUsages : normalizeAgentLoopUsages(result.usages)
    };
  } catch (error) {
    // provider 应优先自行返回带部分 transcript 的 error result；这里是公共入口的最终契约兜底。
    return {
      status: 'error',
      error,
      activePlan: input.activePlan,
      providerState: input.providerState,
      completeMessages: input.messages,
      assistantMessages: [],
      requestIds: [],
      finishReason: 'error',
      usages: pushedUsages
    };
  }
};
