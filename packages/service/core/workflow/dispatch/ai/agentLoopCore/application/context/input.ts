import type { AgentLoopInput } from '../../../../../../ai/llm/agentLoop/interface';

export type BuildAgentLoopCoreInputParams<TChildrenResponse = unknown> =
  AgentLoopInput<TChildrenResponse>;

/**
 * 统一生成传给底层 agent-loop 的 input。
 *
 * 上下文来源仍由节点外壳负责：Workflow Agent 先完成 userContext/history rewrite，
 * ToolCall 先完成 toolProvider finalMessages。core 在这里固定 agent-loop input 字段边界，
 * 避免两个入口继续各自手写恢复参数。
 */
export const buildAgentLoopCoreInput = <TChildrenResponse = unknown>(
  params: BuildAgentLoopCoreInputParams<TChildrenResponse>
): AgentLoopInput<TChildrenResponse> => ({
  messages: params.messages,
  ...(params.systemPrompt !== undefined ? { systemPrompt: params.systemPrompt } : {}),
  ...(params.activePlan !== undefined ? { activePlan: params.activePlan } : {}),
  ...(params.providerState !== undefined ? { providerState: params.providerState } : {}),
  ...(params.userAnswer !== undefined ? { userAnswer: params.userAnswer } : {}),
  ...(params.childrenInteractiveParams !== undefined
    ? { childrenInteractiveParams: params.childrenInteractiveParams }
    : {})
});
