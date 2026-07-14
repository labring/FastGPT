import { describe, expect, it } from 'vitest';
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
});
