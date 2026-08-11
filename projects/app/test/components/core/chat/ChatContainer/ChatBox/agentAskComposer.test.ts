import { describe, expect, it } from 'vitest';
import type { AgentAskQuestionInteractive } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { getAgentAskAnswerDetails } from '@/components/core/chat/ChatContainer/ChatBox/Input/AgentAskComposer';

const questions: AgentAskQuestionInteractive[] = [
  {
    question: 'Choose an action',
    options: [
      { summary: 'Confirm', value: 'confirm' },
      { summary: 'Cancel', value: 'cancel' }
    ],
    answer: ''
  },
  {
    question: 'Add feedback',
    options: [
      { summary: 'Use defaults', value: 'defaults' },
      { summary: 'Use custom input', value: 'custom' }
    ],
    answer: ''
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
