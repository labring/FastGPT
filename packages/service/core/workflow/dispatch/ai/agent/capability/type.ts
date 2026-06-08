import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';

export type CapabilityToolCallResult = {
  response: string;
  usages?: any[];
  assistantResponses?: AIChatItemValueItemType[];
  /** Skill names loaded by this tool call (e.g. ["pptx", "pdf"]) */
  skillNames?: string[];
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
  // Map from file path (or directory prefix) to skill display name.
  // Used to pre-resolve tool display names before SSE emission when
  // sandbox_read_file reads SKILL.md files.
  skillPathMap?: Record<string, string>;
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
