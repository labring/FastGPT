import { describe, expect, it } from 'vitest';
import { AgentPlanAskQueryInteractiveSchema } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { createAgentLoopCoreAskInteractive } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/adapter/interactive';

describe('agentLoopCore ask interactive', () => {
  it('converts ask payload to a multi-question agentAsk response', () => {
    expect(
      createAgentLoopCoreAskInteractive({
        askId: 'call_ask',
        ask: {
          reason: 'Need input',
          blockerType: 'missing_required_input',
          questions: [
            {
              question: 'Confirm?',
              options: [
                { summary: 'Yes', value: 'Yes' },
                { summary: 'No', value: 'No' },
                { summary: 'Not sure', value: 'Not sure' }
              ]
            },
            {
              question: 'Include examples?',
              options: [
                { summary: 'Yes', value: 'Yes' },
                { summary: 'No', value: 'No' }
              ]
            }
          ]
        }
      })
    ).toEqual({
      type: 'agentAsk',
      askId: 'call_ask',
      params: {
        description: 'Need input',
        questions: [
          {
            question: 'Confirm?',
            options: [
              { summary: 'Yes', value: 'Yes' },
              { summary: 'No', value: 'No' },
              { summary: 'Not sure', value: 'Not sure' }
            ],
            answer: ''
          },
          {
            question: 'Include examples?',
            options: [
              { summary: 'Yes', value: 'Yes' },
              { summary: 'No', value: 'No' }
            ],
            answer: ''
          }
        ]
      }
    });
  });

  it('accepts a two-option choice requested by a skill', () => {
    expect(
      AgentPlanAskQueryInteractiveSchema.safeParse({
        type: 'agentPlanAskQuery',
        askId: 'call_skill_choice',
        params: {
          content: 'Which presentation style should I use?',
          reason: 'The selected Skill requires the user to choose a style.',
          blockerType: 'user_choice',
          options: ['Editorial', 'Swiss']
        }
      }).success
    ).toBe(true);
  });
});
