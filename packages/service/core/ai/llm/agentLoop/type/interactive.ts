import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';

// agentLoop 位于 LLM 底层，不直接依赖 workflow 的交互 schema。
// 调用方可通过泛型把 childrenResponse 收敛成自己的固定类型，例如 workflow 使用
// WorkflowInteractiveResponseType。
export type AgentLoopChildrenInteractiveParams<TChildrenResponse = unknown> = {
  childrenResponse: TChildrenResponse;
  toolParams: {
    memoryRequestMessages: ChatCompletionMessageParam[];
    toolCallId: string;
  };
};

export type AgentLoopToolChildrenInteractive<TChildrenResponse = unknown> = {
  type: 'toolChildrenInteractive';
  params: {
    childrenResponse: TChildrenResponse;
    toolParams: {
      memoryRequestMessages: ChatCompletionMessageParam[];
      toolCallId: string;
    };
  };
};
