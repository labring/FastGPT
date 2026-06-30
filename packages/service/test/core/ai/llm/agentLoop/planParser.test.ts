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
          options: [
            '/Volumes/code/FastGPT',
            'Use the current workspace',
            'I will provide another repository path'
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
        options: [
          '/Volumes/code/FastGPT',
          'Use the current workspace',
          'I will provide another repository path'
        ]
      }
    });
  });

  it('rejects ask_agent arguments without required options', () => {
    const result = parsePlanAskToolCall({
      id: 'call_ask',
      type: 'function',
      function: {
        name: 'ask_agent',
        arguments: JSON.stringify({
          reason: 'Need repository path',
          blockerType: 'missing_required_input',
          question: 'Which repository should I inspect?'
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

  it('separates update_plan schema fields by action', () => {
    const parameters = createUpdatePlanTool().function.parameters as {
      properties: {
        updates: {
          items: {
            oneOf: Array<{
              properties: Record<string, unknown>;
              required: string[];
            }>;
          };
        };
      };
    };

    const operationSchemas = parameters.properties.updates.items.oneOf;
    const planSchemas = operationSchemas.filter((schema) => 'plan' in schema.properties);
    const updateStepSchema = operationSchemas.find((schema) => 'stepId' in schema.properties);

    expect(planSchemas).toHaveLength(2);
    planSchemas.forEach((schema) => {
      expect(schema.required).toContain('plan');
    });
    expect(updateStepSchema?.required).toEqual(['action', 'stepId', 'status']);
    expect(updateStepSchema?.properties).not.toHaveProperty('plan');
  });
});
