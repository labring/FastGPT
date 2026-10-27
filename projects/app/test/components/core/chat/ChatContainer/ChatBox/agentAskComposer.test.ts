import { describe, expect, it } from 'vitest';
import type { AgentAskQuestion } from '@fastgpt/global/core/ai/agent/type';
import { getAgentAskAnswerDetails } from '@/components/core/chat/ChatContainer/ChatBox/Input/AgentAskComposer';

const questions: AgentAskQuestion[] = [
  {
    question: 'Choose an action',
    options: [
      { summary: 'Confirm', value: 'confirm' },
      { summary: 'Cancel', value: 'cancel' }
    ]
  },
  {
    question: 'Add feedback',
    options: [
      { summary: 'Use defaults', value: 'defaults' },
      { summary: 'Use custom input', value: 'custom' }
    ]
  }
];

describe('getAgentAskAnswerDetails', () => {
  it('preserves option, custom text, and skipped answer semantics', () => {
    expect(
      getAgentAskAnswerDetails({
        questions,
        answers: {
          '0': 'confirm',
          '1': 'confirm'
        },
        selectedOptionIndexes: {
          '0': 0
        }
      })
    ).toEqual([
      { kind: 'option', value: 'confirm' },
      { kind: 'custom', value: 'confirm' }
    ]);
  });

  it('marks empty answers as skipped even when no option was selected', () => {
    expect(
      getAgentAskAnswerDetails({
        questions,
        answers: {},
        selectedOptionIndexes: {}
      })
    ).toEqual([{ kind: 'skip' }, { kind: 'skip' }]);
  });
});
