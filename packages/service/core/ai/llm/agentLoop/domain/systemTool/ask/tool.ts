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
const LegacyAgentAskQuestionSchema = z.object({
  question: z.string().trim().min(1),
  options: z.array(z.string().trim().min(1)).min(2).max(5)
});

export const AgentAskPayloadSchema = z
  .union([
    AgentAskBaseSchema.extend({
      questions: z.array(AgentAskQuestionSchema).min(1).max(3)
    }),
    AgentAskBaseSchema.extend(LegacyAgentAskQuestionSchema.shape)
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
              options: payload.options.map((option) => ({ summary: option, value: option }))
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
                maxItems: 4,
                description:
                  'Use three choices by default when possible. Choices must be clear, mutually exclusive, definitive answers. Do not use choices to request any input from the user. The user can select exactly one choice or enter a custom answer. Do not add an "Other" choice because the user can enter custom text directly. Each choice uses a short summary phrase and a sentence that explains the answer itself to the user.',
                items: {
                  type: 'object',
                  properties: {
                    summary: {
                      type: 'string',
                      description: 'A short phrase summarizing the answer content.'
                    },
                    value: {
                      type: 'string',
                      description: 'A sentence that explains the answer itself to the user.'
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
