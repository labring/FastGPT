import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';

export type CapabilityToolCallResult = {
  response: string;
  usages?: any[];
  assistantResponses?: AIChatItemValueItemType[];
};

export type CapabilityToolCallHandlerType = (
  toolId: string,
  args: string,
  toolCallId: string
) => Promise<CapabilityToolCallResult | null>;

// Capability interface: each capability contributes system prompt, tools, tool handler, and cleanup
export type AgentCapability = {
  id: string;
  // Appended to the user's systemPrompt
  systemPrompt?: string;
  // Additional tool definitions
  completionTools?: ChatCompletionTool[];
  // Tool call handler: return result if recognized, null otherwise
  handleToolCall?: (
    toolId: string,
    args: string,
    toolCallId: string
  ) => Promise<CapabilityToolCallResult | null>;
  // Resource cleanup (called in finally)
  dispose?: () => Promise<void>;
};

// Create a composite tool call handler that tries each capability in order
export function createCapabilityToolCallHandler(
  capabilities: AgentCapability[]
): CapabilityToolCallHandlerType {
  return async (
    toolId: string,
    args: string,
    toolCallId: string
  ): Promise<CapabilityToolCallResult | null> => {
    for (const cap of capabilities) {
      if (cap.handleToolCall) {
        const result = await cap.handleToolCall(toolId, args, toolCallId);
        if (result !== null) return result;
      }
    }
    return null;
  };
}
