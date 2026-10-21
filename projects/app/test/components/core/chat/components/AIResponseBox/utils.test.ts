import { describe, expect, it } from 'vitest';
import { adaptLegacyAgentPlanAskToReadonlyAgentAsk } from '@/components/core/chat/components/AIResponseBox/utils';

describe('AIResponseBox utils', () => {
  it('adapts legacy agent plan ask as a submitted readonly agent ask', () => {
    expect(
      adaptLegacyAgentPlanAskToReadonlyAgentAsk({
        type: 'agentPlanAskQuery',
        askId: 'ask-1',
        params: {
          content: 'Which direction?',
          reason: 'Need clarification',
          options: ['A', 'B'],
          answer: 'B'
        }
      })
    ).toEqual({
      type: 'agentAsk',
      askId: 'ask-1',
      params: {
        description: 'Need clarification',
        questions: [
          {
            question: 'Which direction?',
            options: [
              { summary: 'A', value: 'A' },
              { summary: 'B', value: 'B' }
            ],
            answer: 'B'
          }
        ],
        submitted: true
      }
    });
  });
});
