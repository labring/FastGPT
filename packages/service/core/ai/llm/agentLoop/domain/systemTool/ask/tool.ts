import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import z from 'zod';

export const AgentAskPayloadSchema = z.object({
  reason: z.string(),
  blockerType: z.enum([
    'missing_required_input',
    'tool_unavailable',
    'ambiguous_goal',
    'user_choice'
  ]),
  question: z.string(),
  options: z.array(z.string().trim().min(1)).min(2).max(5)
});
export type AgentAskPayload = z.infer<typeof AgentAskPayloadSchema>;

/**
 * 创建单主 loop 的用户追问工具。
 * 当任务或 Skill 需要用户通过选项补充信息或做出有意义的选择时，通过该工具暂停并追问用户。
 */
export const createAskAgentTool = (name = 'ask_agent'): ChatCompletionTool => ({
  type: 'function',
  function: {
    name,
    description:
      'Ask the user for information or a decision through selectable options. Use when the task or a Skill needs user input, including required data, meaningful preferences, unavailable tools, or an ambiguous goal. Avoid low-impact questions that can be reasonably assumed.',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Why user input is useful or needed before continuing.'
        },
        blockerType: {
          type: 'string',
          enum: ['missing_required_input', 'tool_unavailable', 'ambiguous_goal', 'user_choice'],
          description:
            'Use user_choice when asking the user to select a meaningful preference, scope, format, or execution path.'
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
            'Two to five concise answer choices the user can select directly. Each item must be a complete answer.',
          items: {
            type: 'string'
          }
        }
      },
      required: ['reason', 'blockerType', 'question', 'options']
    }
  }
});
