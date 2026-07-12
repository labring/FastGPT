import { describe, expect, it } from 'vitest';
import {
  createAskUserAgentTool,
  createUpdatePlanAgentTool
} from '@fastgpt/service/core/ai/llm/agentLoop/interface';
import { parseAgentAskToolCall } from '@fastgpt/service/core/ai/llm/agentLoop/domain/systemTool/ask';
import { createAskAgentTool } from '@fastgpt/service/core/ai/llm/agentLoop/domain/systemTool/ask/tool';
import { createUpdatePlanTool } from '@fastgpt/service/core/ai/llm/agentLoop/domain/systemTool/plan/updateTool';

describe('agent loop system ask tool', () => {
  it('parses ask_agent tool call arguments', () => {
    const result = parseAgentAskToolCall({
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

  it('rejects ask_agent arguments without required suggested options', () => {
    const result = parseAgentAskToolCall({
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
    expect(result.error).toContain('options');
  });

  it('creates internal tool schemas without workflow dependencies', () => {
    expect(createAskAgentTool().function.name).toBe('ask_agent');
    expect(createUpdatePlanTool().function.name).toBe('update_plan');
    expect(createAskUserAgentTool().function.name).toBe('ask_user');
    expect(createUpdatePlanAgentTool().function.name).toBe('update_plan');
    const planSchema = createUpdatePlanTool().function.parameters as any;
    expect(planSchema.oneOf).toHaveLength(3);
    expect(planSchema.oneOf[0].properties.action.enum).toEqual(['set_plan']);
    expect(planSchema.oneOf[0].properties.steps.items.properties).not.toHaveProperty('id');
    expect(planSchema.oneOf[1].properties.action.enum).toEqual(['add_steps']);
    expect(planSchema.oneOf[1].properties.steps.items.properties).not.toHaveProperty('id');
    expect(planSchema.oneOf[2].properties.action.enum).toEqual(['update_steps']);
    expect(planSchema.oneOf[2].properties.steps.items.properties).toHaveProperty('id');
    expect(planSchema.oneOf[2].properties.steps.items.properties).toHaveProperty('status');
  });

  it('exposes only the three supported update_plan actions', () => {
    const parameters = createUpdatePlanTool().function.parameters as any;

    expect(parameters).not.toHaveProperty('properties.updates');
    expect(parameters.oneOf.map((schema: any) => schema.properties.action.enum[0])).toEqual([
      'set_plan',
      'add_steps',
      'update_steps'
    ]);
  });
});
