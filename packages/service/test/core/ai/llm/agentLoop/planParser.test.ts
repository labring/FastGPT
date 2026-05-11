import { describe, expect, it } from 'vitest';
import {
  createAskAgentTool,
  createUpdatePlanTool,
  parsePlanAskToolCall
} from '@fastgpt/service/core/ai/llm/agentLoop';

describe('agent loop plan parser', () => {
  it('parses ask_agent tool call arguments', () => {
    const result = parsePlanAskToolCall({
      id: 'call_ask',
      type: 'function',
      function: {
        name: 'ask_agent',
        arguments: JSON.stringify({
          reason: 'Need repository path',
          blockerType: 'missing_required_input',
          question: 'Which repository should I inspect?',
          questions: [
            {
              question: 'Repository path?',
              whyRequired: 'Code cannot be read without a path.',
              source: 'user_request'
            }
          ]
        })
      }
    });

    expect(result).toEqual({
      success: true,
      ask: {
        reason: 'Need repository path',
        blockerType: 'missing_required_input',
        question: 'Which repository should I inspect?',
        questions: [
          {
            question: 'Repository path?',
            whyRequired: 'Code cannot be read without a path.',
            source: 'user_request'
          }
        ]
      }
    });
  });

  it('rejects ask_agent arguments without required whyRequired fields', () => {
    const result = parsePlanAskToolCall({
      id: 'call_ask',
      type: 'function',
      function: {
        name: 'ask_agent',
        arguments: JSON.stringify({
          reason: 'Need repository path',
          blockerType: 'missing_required_input',
          question: 'Which repository should I inspect?',
          questions: [
            {
              question: 'Repository path?',
              source: 'user_request'
            }
          ]
        })
      }
    });

    expect(result.success).toBe(false);
  });

  it('creates internal tool schemas without workflow dependencies', () => {
    expect(createAskAgentTool().function.name).toBe('ask_agent');
    expect(createUpdatePlanTool().function.name).toBe('update_plan');
    expect(createUpdatePlanTool().function.parameters.required).toEqual(['updates']);
  });
});
