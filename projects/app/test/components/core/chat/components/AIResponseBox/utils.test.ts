import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventNameEnum, eventBus } from '@/web/common/utils/eventbus';
import {
  adaptLegacyAgentPlanAskToReadonlyAgentAsk,
  onSendPrompt
} from '@/components/core/chat/components/AIResponseBox/utils';

describe('AIResponseBox utils', () => {
  beforeEach(() => {
    eventBus.off(EventNameEnum.sendQuestion);
  });

  it('does not request clearing chat input for interactive send event', () => {
    const handler = vi.fn();
    eventBus.on(EventNameEnum.sendQuestion, handler);

    onSendPrompt('A');

    expect(handler).toHaveBeenCalledWith({
      text: 'A',
      focus: true
    });
  });

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
