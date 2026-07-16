import { describe, expect, it } from 'vitest';
import { AgentPlanAskQueryInteractiveSchema } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { createAgentLoopCoreAskInteractive } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/adapter/interactive';

describe('agentLoopCore ask interactive', () => {
  it('converts ask payload to workflow interactive response', () => {
    expect(
      createAgentLoopCoreAskInteractive({
        askId: 'call_ask',
        ask: {
          reason: 'Need input',
          blockerType: 'missing_required_input',
          question: 'Confirm?',
          options: ['Yes', 'No', 'Not sure']
        }
      })
    ).toEqual({
      type: 'agentPlanAskQuery',
      askId: 'call_ask',
      params: {
        content: 'Confirm?',
        reason: 'Need input',
        blockerType: 'missing_required_input',
        options: ['Yes', 'No', 'Not sure']
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
