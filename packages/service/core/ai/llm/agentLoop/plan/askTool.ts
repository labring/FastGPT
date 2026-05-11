import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import z from 'zod';

export const PlanAskQuestionSchema = z.object({
  question: z.string(),
  whyRequired: z.string(),
  source: z.string()
});

export const PlanAskPayloadSchema = z.object({
  reason: z.string(),
  blockerType: z.enum(['missing_required_input', 'tool_unavailable', 'ambiguous_goal']),
  question: z.string(),
  questions: z.array(PlanAskQuestionSchema).max(3).optional()
});
export type PlanAskPayload = z.infer<typeof PlanAskPayloadSchema>;

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
          description: 'A concise user-facing question.'
        },
        questions: {
          type: 'array',
          maxItems: 3,
          items: {
            type: 'object',
            properties: {
              question: {
                type: 'string'
              },
              whyRequired: {
                type: 'string'
              },
              source: {
                type: 'string'
              }
            },
            required: ['question', 'whyRequired', 'source']
          }
        }
      },
      required: ['reason', 'blockerType', 'question']
    }
  }
});
