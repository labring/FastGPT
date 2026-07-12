import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall
} from '@fastgpt/global/core/ai/llm/type';

// agentLoop 位于 LLM 底层，不直接依赖 workflow 的交互 schema。
// 调用方可通过泛型把 childrenResponse 收敛成自己的固定类型，例如 workflow 使用
// WorkflowInteractiveResponseType。
export type AgentLoopChildrenInteractiveParams<TChildrenResponse = unknown> = {
  childrenResponse: TChildrenResponse;
  toolParams: {
    memoryRequestMessages?: ChatCompletionMessageParam[];
    toolCallId: string;
  };
};

/**
 * 恢复交互工具时的运行时参数。
 *
 * childrenResponse/toolCallId 来自持久化的交互快照；call/messages 由 provider 在本轮
 * 已重建的上下文中补齐，只用于执行工具，不需要进入 workflow interactive 存储结构。
 */
export type AgentLoopInteractiveToolExecuteParams<TChildrenResponse = unknown> =
  AgentLoopChildrenInteractiveParams<TChildrenResponse> & {
    call: ChatCompletionMessageToolCall;
    messages: ChatCompletionMessageParam[];
  };
