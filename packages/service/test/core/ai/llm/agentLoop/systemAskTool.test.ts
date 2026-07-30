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
  it('parses up to three ask_agent questions', () => {
    const result = parseAgentAskToolCall({
      id: 'call_ask',
      type: 'function',
      function: {
        name: 'ask_agent',
        arguments: JSON.stringify({
          reason: 'Need repository path',
          blockerType: 'missing_required_input',
          questions: [
            {
              question: 'Which repository should I inspect?',
              options: [
                { summary: 'FastGPT repository', value: '/Volumes/code/FastGPT' },
                { summary: 'Current workspace', value: 'Use the current workspace' },
                { summary: 'Another repository', value: 'I will provide another repository path' }
              ]
            },
            {
              question: 'Which output should I create?',
              options: [
                { summary: 'Document', value: 'Document' },
                { summary: 'Spreadsheet', value: 'Spreadsheet' }
              ]
            },
            {
              question: 'Should I include examples?',
              options: [
                { summary: 'Include examples', value: 'Include examples' },
                { summary: 'Skip examples', value: 'Skip examples' }
              ]
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
        questions: [
          {
            question: 'Which repository should I inspect?',
            options: [
              { summary: 'FastGPT repository', value: '/Volumes/code/FastGPT' },
              { summary: 'Current workspace', value: 'Use the current workspace' },
              { summary: 'Another repository', value: 'I will provide another repository path' }
            ]
          },
          {
            question: 'Which output should I create?',
            options: [
              { summary: 'Document', value: 'Document' },
              { summary: 'Spreadsheet', value: 'Spreadsheet' }
            ]
          },
          {
            question: 'Should I include examples?',
            options: [
              { summary: 'Include examples', value: 'Include examples' },
              { summary: 'Skip examples', value: 'Skip examples' }
            ]
          }
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

  it('normalizes the legacy single-question format', () => {
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
        questions: [
          {
            question: 'Which output should I create?',
            options: [
              { summary: 'Document', value: 'Document' },
              { summary: 'Spreadsheet', value: 'Spreadsheet' }
            ]
          }
        ]
      }
    });

    const parameters = createAskAgentTool().function.parameters as any;
    expect(parameters.properties.questions).toMatchObject({
      minItems: 1,
      maxItems: 3
    });
    expect(parameters.properties.questions.items.properties.options).toMatchObject({
      minItems: 2,
      maxItems: 4
    });
    expect(parameters.properties.questions.items.properties.options.items.required).toEqual([
      'summary',
      'value'
    ]);
    expect(parameters.properties.blockerType.enum).toContain('user_choice');
    expect(createAskAgentTool().function.description).toContain('task or a Skill');
  });

  it('rejects questions with more than four options', () => {
    const result = parseAgentAskToolCall({
      id: 'call_ask',
      type: 'function',
      function: {
        name: 'ask_agent',
        arguments: JSON.stringify({
          reason: 'Need a choice',
          blockerType: 'user_choice',
          questions: [
            {
              question: 'Which output should I create?',
              options: Array.from({ length: 5 }, (_, index) => ({
                summary: `Option ${index + 1}`,
                value: `Option ${index + 1}`
              }))
            }
          ]
        })
      }
    });

    expect(result.success).toBe(false);
  });

  it('accepts duplicate option summaries and values', () => {
    const baseQuestion = {
      question: 'Which output should I create?'
    };
    const createCall = (options: Array<{ summary: string; value: string }>) =>
      parseAgentAskToolCall({
        id: 'call_ask',
        type: 'function',
        function: {
          name: 'ask_agent',
          arguments: JSON.stringify({
            reason: 'Need a choice',
            blockerType: 'user_choice',
            questions: [{ ...baseQuestion, options }]
          })
        }
      });

    expect(
      createCall([
        { summary: 'Document', value: 'Document' },
        { summary: 'Document', value: 'Spreadsheet' }
      ]).success
    ).toBe(true);
    expect(
      createCall([
        { summary: 'Document', value: 'Document' },
        { summary: 'Spreadsheet', value: 'Document' }
      ]).success
    ).toBe(true);
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
