import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import z from 'zod';

export const AgentAskPayloadSchema = z.object({
  reason: z.string(),
  blockerType: z.enum(['missing_required_input', 'tool_unavailable', 'ambiguous_goal']),
  question: z.string(),
  options: z.array(z.string().trim().min(1)).min(2).max(5)
});
export type AgentAskPayload = z.infer<typeof AgentAskPayloadSchema>;

/**
 * 创建单主 loop 的用户追问工具。
 * 只有在缺少必需输入、工具不可用或目标完全不明确时，模型才应该通过该工具暂停并追问用户。
 */
export const createAskAgentTool = (name = 'ask_agent'): ChatCompletionTool => ({
  type: 'function',
  function: {
    name,
    description:
      'Ask the user only when required private input, unavailable required tools, or a completely ambiguous goal blocks planning.',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Why the question is strictly required before planning can continue.'
        },
        blockerType: {
          type: 'string',
          enum: ['missing_required_input', 'tool_unavailable', 'ambiguous_goal']
        },
        question: {
          type: 'string',
          description: 'A concise user-facing question shown as the title of the choice card.'
        },
        options: {
          type: 'array',
          minItems: 2,
          maxItems: 5,
          description:
            'Concise answer choices the user can select directly. The client always supports free-form input.',
          items: {
            type: 'string'
          }
        }
      },
      required: ['reason', 'blockerType', 'question', 'options']
    }
  }
});
