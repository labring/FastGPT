import { describe, expect, it } from 'vitest';
import {
  createAskUserAgentTool,
  createSetPlanAgentTool,
  createUpdatePlanAgentTool
} from '@fastgpt/service/core/ai/llm/agentLoop/interface';
import { parseAgentAskToolCall } from '@fastgpt/service/core/ai/llm/agentLoop/domain/systemTool/ask';
import { createAskAgentTool } from '@fastgpt/service/core/ai/llm/agentLoop/domain/systemTool/ask/tool';
import {
  createSetPlanTool,
  createUpdatePlanTool
} from '@fastgpt/service/core/ai/llm/agentLoop/domain/systemTool/plan/updateTool';

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

  it('supports a two-option user choice', () => {
    const result = parseAgentAskToolCall({
      id: 'call_ask',
      type: 'function',
      function: {
        name: 'ask_agent',
        arguments: JSON.stringify({
          reason: 'Need a choice',
          blockerType: 'user_choice',
          question: 'Which output should I create?',
          options: ['Document', 'Spreadsheet']
        })
      }
    });

    expect(result).toEqual({
      success: true,
      ask: {
        reason: 'Need a choice',
        blockerType: 'user_choice',
        question: 'Which output should I create?',
        options: ['Document', 'Spreadsheet']
      }
    });

    const parameters = createAskAgentTool().function.parameters as any;
    expect(parameters.properties.options).toMatchObject({
      minItems: 2,
      maxItems: 5
    });
    expect(parameters.properties.blockerType.enum).toContain('user_choice');
    expect(createAskAgentTool().function.description).toContain('task or a Skill');
  });

  it('creates internal tool schemas without workflow dependencies', () => {
    expect(createAskAgentTool().function.name).toBe('ask_agent');
    expect(createSetPlanTool().function.name).toBe('set_plan');
    expect(createUpdatePlanTool().function.name).toBe('update_plan');
    expect(createAskUserAgentTool().function.name).toBe('ask_user');
    expect(createSetPlanAgentTool().function.name).toBe('set_plan');
    expect(createUpdatePlanAgentTool().function.name).toBe('update_plan');
    const setPlanSchema = createSetPlanTool().function.parameters as any;
    const updatePlanSchema = createUpdatePlanTool().function.parameters as any;
    expect(setPlanSchema).not.toHaveProperty('oneOf');
    expect(setPlanSchema.properties.steps.items).toEqual({ type: 'string' });
    expect(setPlanSchema.required).toEqual(['name', 'steps']);
    expect(createSetPlanTool().function.description).toContain(
      'before any sandbox or runtime tool'
    );
    expect(createSetPlanTool().function.description).toContain('use update_plan instead');
    expect(updatePlanSchema).not.toHaveProperty('oneOf');
    expect(updatePlanSchema).not.toHaveProperty('properties.action');
    expect(updatePlanSchema.properties.add_steps.items).toEqual({ type: 'string' });
    expect(updatePlanSchema.properties.updates.items.required).toEqual(['id', 'status']);
  });

  it('keeps plan tool arguments flat for model compatibility', () => {
    const setParameters = createSetPlanTool().function.parameters as any;
    const updateParameters = createUpdatePlanTool().function.parameters as any;

    expect(Object.keys(setParameters.properties)).toEqual(['name', 'steps']);
    expect(Object.keys(updateParameters.properties)).toEqual(['updates', 'add_steps']);
  });
});
