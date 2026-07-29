import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import {
  AgentAskBlockerTypeSchema,
  AgentAskQuestionSchema
} from '@fastgpt/global/core/ai/agent/type';
import z from 'zod';

const AgentAskBaseSchema = z.object({
  reason: z.string(),
  blockerType: AgentAskBlockerTypeSchema
});

export const AgentAskPayloadSchema = z
  .union([
    AgentAskBaseSchema.extend({
      questions: z.array(AgentAskQuestionSchema).min(1).max(3)
    }),
    AgentAskBaseSchema.extend(AgentAskQuestionSchema.shape)
  ])
  .transform((payload) =>
    'questions' in payload
      ? payload
      : // ? Compatibility fallback for reading legacy payload.
        {
          reason: payload.reason,
          blockerType: payload.blockerType,
          questions: [
            {
              question: payload.question,
              options: payload.options
            }
          ]
        }
  );
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
        questions: {
          type: 'array',
          minItems: 1,
          maxItems: 3,
          description: 'One to three concise user-facing questions to collect together.',
          items: {
            type: 'object',
            properties: {
              question: {
                type: 'string',
                description: 'A concise user-facing question shown as the title of a choice card.'
              },
              options: {
                type: 'array',
                minItems: 2,
                maxItems: 5,
                description:
                  'Two to five choices. summary is concise UI text; value is the complete answer returned after selection.',
                items: {
                  type: 'object',
                  properties: {
                    summary: {
                      type: 'string',
                      description: 'Concise option text shown to the user.'
                    },
                    value: {
                      type: 'string',
                      description: 'Complete answer returned to the agent after selection.'
                    }
                  },
                  required: ['summary', 'value']
                }
              }
            },
            required: ['question', 'options']
          }
        }
      },
      required: ['reason', 'blockerType', 'questions']
    }
  }
});
