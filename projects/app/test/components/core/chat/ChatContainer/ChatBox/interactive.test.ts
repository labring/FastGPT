import { describe, expect, it } from 'vitest';
import { ChatRoleEnum, ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { ChatSiteItemType } from '@/components/core/chat/ChatContainer/ChatBox/type';
import {
  getInteractiveByHistories,
  isPendingAgentAsk,
  isUserInputInteractiveSubmitted,
  persistAgentAskAnswersToHistories,
  resolveInteractiveResponseChatItemId,
  rewriteHistoriesByInteractiveResponse
} from '@/components/core/chat/ChatContainer/ChatBox/utils/interactive';

const baseInteractive = {
  entryNodeIds: ['node-1'],
  memoryEdges: [],
  nodeOutputs: [],
  usageId: 'usage-1'
};

const createAiRecord = (
  interactive?: WorkflowInteractiveResponseType,
  override: Partial<ChatSiteItemType> = {}
): ChatSiteItemType =>
  ({
    id: override.id ?? 'ai-1',
    dataId: override.dataId ?? 'ai-1',
    obj: ChatRoleEnum.AI,
    status: ChatStatusEnum.finish,
    value: interactive
      ? [
          {
            interactive
          }
        ]
      : [
          {
            text: {
              content: 'done'
            }
          }
        ],
    ...override
  }) as ChatSiteItemType;

const createHumanRecord = (id = 'human-1'): ChatSiteItemType =>
  ({
    id,
    dataId: id,
    obj: ChatRoleEnum.Human,
    status: ChatStatusEnum.finish,
    value: [
      {
        text: {
          content: id
        }
      }
    ]
  }) as ChatSiteItemType;

const createAiPlaceholder = (id = 'ai-placeholder'): ChatSiteItemType =>
  createAiRecord(undefined, {
    id,
    dataId: id,
    status: ChatStatusEnum.loading,
    value: [
      {
        text: {
          content: ''
        }
      }
    ]
  });

const createUserSelectInteractive = (userSelectedVal?: string): WorkflowInteractiveResponseType =>
  ({
    ...baseInteractive,
    type: 'userSelect',
    params: {
      description: 'choose one',
      userSelectOptions: [
        {
          key: 'A',
          value: 'A'
        },
        {
          key: 'B',
          value: 'B'
        }
      ],
      userSelectedVal
    }
  }) as WorkflowInteractiveResponseType;

const createUserInputInteractive = ({
  submitted = false
}: { submitted?: boolean } = {}): WorkflowInteractiveResponseType =>
  ({
    ...baseInteractive,
    type: 'userInput',
    params: {
      description: 'fill form',
      submitted,
      inputForm: [
        {
          type: FlowNodeInputTypeEnum.input,
          key: 'name',
          label: 'Name',
          value: '',
          valueType: WorkflowIOValueTypeEnum.string,
          required: false
        }
      ]
    }
  }) as WorkflowInteractiveResponseType;

describe('getInteractiveByHistories', () => {
  it('allows normal chat when no pending interactive exists', () => {
    expect(getInteractiveByHistories([createAiRecord()])).toEqual({
      interactive: undefined,
      canSendQuery: true
    });
  });

  it('blocks normal query for unselected userSelect interactive', () => {
    const interactive = createUserSelectInteractive();

    expect(getInteractiveByHistories([createAiRecord(interactive)])).toEqual({
      interactive,
      canSendQuery: false
    });
  });

  it('allows normal query after userSelect has been answered', () => {
    expect(getInteractiveByHistories([createAiRecord(createUserSelectInteractive('A'))])).toEqual({
      interactive: undefined,
      canSendQuery: true
    });
  });

  it('adapts unanswered legacy agent plan ask interactive to a pending agentAsk', () => {
    const interactive = {
      ...baseInteractive,
      type: 'agentPlanAskQuery',
      askId: 'ask-1',
      params: {
        content: 'Need more detail',
        options: ['A', 'B', 'C']
      }
    } as WorkflowInteractiveResponseType;

    const result = getInteractiveByHistories([createAiRecord(interactive)]);

    expect(result).toMatchObject({
      interactive: {
        type: 'agentAsk',
        askId: 'ask-1',
        params: {
          description: '',
          questions: [
            {
              question: 'Need more detail',
              options: [
                { summary: 'A', value: 'A' },
                { summary: 'B', value: 'B' },
                { summary: 'C', value: 'C' }
              ],
              answer: ''
            }
          ]
        }
      },
      canSendQuery: true
    });
    expect(isPendingAgentAsk(result.interactive)).toBe(true);
  });
});

describe('isPendingAgentAsk', () => {
  it('matches only pending agentAsk records', () => {
    expect(
      isPendingAgentAsk({
        ...baseInteractive,
        type: 'agentAsk',
        askId: 'ask-1',
        params: {
          description: 'Need input',
          questions: [
            {
              question: 'Need input?',
              options: [
                { summary: 'A', value: 'A' },
                { summary: 'B', value: 'B' }
              ],
              answer: ''
            }
          ]
        }
      } as WorkflowInteractiveResponseType)
    ).toBe(true);
    expect(isPendingAgentAsk(createUserInputInteractive())).toBe(false);
    expect(isPendingAgentAsk()).toBe(false);
  });
});

describe('isUserInputInteractiveSubmitted', () => {
  it('treats persisted formInputResult as a submitted historical form', () => {
    const interactive = createUserInputInteractive() as Extract<
      WorkflowInteractiveResponseType,
      { type: 'userInput' }
    >;

    expect(
      isUserInputInteractiveSubmitted({
        interactive,
        isLastChild: true,
        responseData: [{ formInputResult: { name: 'FastGPT' } } as any]
      })
    ).toBe(true);
  });
});

describe('rewriteHistoriesByInteractiveResponse', () => {
  it('writes userSelect answer into the previous interactive and removes temporary round records', () => {
    const interactive = createUserSelectInteractive();
    const result = rewriteHistoriesByInteractiveResponse({
      histories: [createAiRecord(interactive), createHumanRecord(), createAiPlaceholder()],
      interactive,
      interactiveVal: 'B'
    });

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe(ChatStatusEnum.loading);
    expect((result[0].value[0] as any).interactive.params.userSelectedVal).toBe('B');
  });

  it('writes parsed userInput values into the submitted form', () => {
    const interactive = createUserInputInteractive();
    const result = rewriteHistoriesByInteractiveResponse({
      histories: [createAiRecord(interactive), createHumanRecord(), createAiPlaceholder()],
      interactive,
      interactiveVal: JSON.stringify({
        name: 'FastGPT'
      })
    });

    expect(result).toHaveLength(1);
    expect((result[0].value[0] as any).interactive.params.submitted).toBe(true);
    expect((result[0].value[0] as any).interactive.params.inputForm[0].value).toBe('FastGPT');
  });

  it('writes auxiliary agentAsk answers into the original AI record', () => {
    const interactive = {
      ...baseInteractive,
      type: 'agentAsk',
      askId: 'chat-agent-helper-ask',
      responseMode: 'submit',
      params: {
        description: 'Collect requirements',
        questions: [
          {
            question: 'Audience?',
            options: [
              { summary: 'Developers', value: 'Developers' },
              { summary: 'Designers', value: 'Designers' }
            ],
            answer: ''
          },
          {
            question: 'Format?',
            options: [
              { summary: 'Course', value: 'Course' },
              { summary: 'Workshop', value: 'Workshop' }
            ],
            answer: ''
          }
        ]
      }
    } as WorkflowInteractiveResponseType;
    const result = rewriteHistoriesByInteractiveResponse({
      histories: [createAiRecord(interactive), createHumanRecord(), createAiPlaceholder()],
      interactive,
      interactiveVal: JSON.stringify({ answers: ['Developers', 'Workshop'] })
    });

    const submittedInteractive = (result[0].value[0] as any).interactive;
    expect(submittedInteractive.params.questions.map((question: any) => question.answer)).toEqual([
      'Developers',
      'Workshop'
    ]);
    expect(submittedInteractive.params.submitted).toBe(true);
  });

  it('marks paymentPause as continued and removes temporary round records', () => {
    const interactive = {
      ...baseInteractive,
      type: 'paymentPause',
      params: {
        description: 'insufficient points'
      }
    } as WorkflowInteractiveResponseType;

    const result = rewriteHistoriesByInteractiveResponse({
      histories: [createAiRecord(interactive), createHumanRecord(), createAiPlaceholder()],
      interactive,
      interactiveVal: ''
    });

    expect(result).toHaveLength(1);
    expect((result[0].value[0] as any).interactive.params.continue).toBe(true);
  });

  it('keeps the temporary user round when agentPlanAskQuery becomes a normal query', () => {
    const interactive = {
      ...baseInteractive,
      type: 'agentPlanAskQuery',
      askId: 'ask-1',
      params: {
        content: 'Need more detail',
        options: ['A', 'B', 'C']
      }
    } as WorkflowInteractiveResponseType;

    const histories = [createAiRecord(interactive), createHumanRecord(), createAiPlaceholder()];
    const result = rewriteHistoriesByInteractiveResponse({
      histories,
      interactive,
      interactiveVal: 'new user question'
    });

    expect(result).toHaveLength(3);
    expect(result[1]).toBe(histories[1]);
    expect(result[2]).toEqual({
      ...histories[2],
      status: ChatStatusEnum.loading
    });
  });

  it('keeps legacy agentPlanAskQuery read-only', () => {
    const interactive = {
      ...baseInteractive,
      type: 'agentPlanAskQuery',
      askId: 'ask-1',
      params: {
        content: 'Need more detail',
        options: ['A', 'B', 'C']
      }
    } as WorkflowInteractiveResponseType;

    const histories = [createAiRecord(interactive), createHumanRecord(), createAiPlaceholder()];
    const result = rewriteHistoriesByInteractiveResponse({
      histories,
      interactive,
      interactiveVal: 'B'
    });

    expect(result).toHaveLength(3);
    expect((result[0].value[0] as any).interactive.params.answer).toBeUndefined();
    expect(result[2]).toEqual({
      ...histories[2],
      status: ChatStatusEnum.loading
    });
  });

  it('persists multi-question agentAsk values for query responses', () => {
    const interactive = {
      ...baseInteractive,
      type: 'agentAsk',
      askId: 'ask-1',
      params: {
        description: 'Need input',
        questions: [
          {
            question: 'First?',
            options: [
              { summary: 'A', value: 'A' },
              { summary: 'B', value: 'B' }
            ],
            answer: ''
          },
          {
            question: 'Second?',
            options: [
              { summary: 'C', value: 'C' },
              { summary: 'D', value: 'D' }
            ],
            answer: ''
          }
        ]
      }
    } as WorkflowInteractiveResponseType;
    const histories = [createAiRecord(interactive), createHumanRecord(), createAiPlaceholder()];
    const result = rewriteHistoriesByInteractiveResponse({
      histories,
      interactive,
      interactiveVal: JSON.stringify({ answers: ['A', ''] })
    });

    const submittedInteractive = (result[0].value[0] as any).interactive;
    expect(submittedInteractive.params.submitted).toBe(true);
    expect(submittedInteractive.params.questions.map((question: any) => question.answer)).toEqual([
      'A',
      ''
    ]);
    expect(result[2]).toEqual({
      ...histories[2],
      status: ChatStatusEnum.loading
    });
  });

  it('persists the stable option value and revision text separately from the visible answer', () => {
    const interactive = {
      ...baseInteractive,
      type: 'workflowBuilderPreview',
      previewId: 'ask-preview',
      params: {
        title: 'Confirm this workflow?',
        mermaid: 'flowchart LR\n  A --> B',
        sections: [],
        actions: [
          { value: 'confirm', label: 'Confirm', inputMode: 'none' },
          { value: 'revise', label: 'Revise', inputMode: 'text' },
          { value: 'cancel', label: 'Cancel', inputMode: 'none' }
        ]
      }
    } as WorkflowInteractiveResponseType;

    const result = rewriteHistoriesByInteractiveResponse({
      histories: [createAiRecord(interactive), createHumanRecord(), createAiPlaceholder()],
      interactive,
      interactiveVal: 'Add a review branch',
      agentPlanAskResponse: {
        askId: 'ask-preview',
        optionValue: 'revise',
        text: 'Add a review branch'
      }
    });

    expect((result[0].value[0] as any).interactive.params).toMatchObject({
      answerValue: 'revise',
      answerText: 'Add a review branch'
    });
  });

  it('only persists an agent ask answer to the matching askId', () => {
    const firstAsk = {
      ...baseInteractive,
      type: 'agentAsk',
      askId: 'ask-1',
      params: {
        description: 'Need input',
        questions: [
          {
            question: 'First question',
            options: [
              { summary: 'A', value: 'A' },
              { summary: 'B', value: 'B' }
            ],
            answer: ''
          }
        ]
      }
    } as WorkflowInteractiveResponseType;
    const secondAsk = {
      ...baseInteractive,
      type: 'agentAsk',
      askId: 'ask-2',
      params: {
        description: 'Need input',
        questions: [
          {
            question: 'Second question',
            options: [
              { summary: 'A', value: 'A' },
              { summary: 'B', value: 'B' }
            ],
            answer: ''
          }
        ]
      }
    } as WorkflowInteractiveResponseType;
    const unrelatedInteractive = {
      ...createUserSelectInteractive(),
      askId: 'ask-2'
    } as WorkflowInteractiveResponseType;

    const result = persistAgentAskAnswersToHistories({
      histories: [
        createAiRecord(firstAsk),
        createAiRecord(secondAsk, { id: 'ai-2' }),
        createAiRecord(unrelatedInteractive, { id: 'ai-3' })
      ],
      interactive: secondAsk,
      answer: JSON.stringify({ answers: ['B'] })
    });

    expect((result[0].value[0] as any).interactive.params.questions[0].answer).toBe('');
    expect((result[1].value[0] as any).interactive.params.questions[0].answer).toBe('B');
    expect((result[2].value[0] as any).interactive.params.answer).toBeUndefined();
  });

  it('replaces an unanswered legacy agent ask with submitted agentAsk', () => {
    const legacyAsk = {
      ...baseInteractive,
      type: 'agentPlanAskQuery',
      askId: 'ask-1',
      params: {
        content: 'Need more detail',
        reason: 'Choose one',
        options: ['A', 'B', 'C']
      }
    } as WorkflowInteractiveResponseType;
    const pendingAsk = {
      ...baseInteractive,
      type: 'agentAsk',
      askId: 'ask-1',
      params: {
        description: 'Choose one',
        questions: [
          {
            question: 'Need more detail',
            options: [
              { summary: 'A', value: 'A' },
              { summary: 'B', value: 'B' },
              { summary: 'C', value: 'C' }
            ],
            answer: ''
          }
        ]
      }
    } as WorkflowInteractiveResponseType;

    const result = persistAgentAskAnswersToHistories({
      histories: [createAiRecord(legacyAsk)],
      interactive: pendingAsk,
      answer: JSON.stringify({ answers: ['B'] })
    });

    expect((result[0].value[0] as any).interactive).toMatchObject({
      type: 'agentAsk',
      askId: 'ask-1',
      params: {
        description: 'Choose one',
        questions: [
          {
            question: 'Need more detail',
            options: [
              { summary: 'A', value: 'A' },
              { summary: 'B', value: 'B' },
              { summary: 'C', value: 'C' }
            ],
            answer: 'B'
          }
        ],
        submitted: true
      }
    });
  });
});

describe('resolveInteractiveResponseChatItemId', () => {
  it('uses the previous AI dataId for interactive submit', () => {
    const interactive = createUserSelectInteractive();

    expect(
      resolveInteractiveResponseChatItemId({
        histories: [
          createAiRecord(undefined, { dataId: 'old-ai-1' }),
          createHumanRecord('human-2'),
          createAiRecord(interactive, { dataId: 'old-ai-2' })
        ],
        interactive,
        interactiveVal: 'A',
        responseChatItemId: 'new-response-id'
      })
    ).toBe('old-ai-2');
  });

  it('keeps the new responseChatItemId for agent plan query', () => {
    const interactive = {
      ...baseInteractive,
      type: 'agentPlanAskQuery',
      askId: 'ask-1',
      params: {
        content: 'Need more detail',
        options: ['A', 'B', 'C']
      }
    } as WorkflowInteractiveResponseType;

    expect(
      resolveInteractiveResponseChatItemId({
        histories: [createAiRecord(interactive, { dataId: 'old-ai-1' })],
        interactive,
        interactiveVal: 'new user question',
        responseChatItemId: 'new-response-id'
      })
    ).toBe('new-response-id');
  });

  it('keeps the new responseChatItemId for agentAsk', () => {
    const interactive = {
      ...baseInteractive,
      type: 'agentAsk',
      askId: 'ask-1',
      params: {
        description: 'Need input',
        questions: [
          {
            question: 'Need input?',
            options: [
              { summary: 'A', value: 'A' },
              { summary: 'B', value: 'B' }
            ],
            answer: ''
          }
        ]
      }
    } as WorkflowInteractiveResponseType;

    expect(
      resolveInteractiveResponseChatItemId({
        histories: [createAiRecord(interactive, { dataId: 'old-ai-1' })],
        interactive,
        interactiveVal: JSON.stringify({ answers: ['A'] }),
        responseChatItemId: 'new-response-id'
      })
    ).toBe('new-response-id');
  });

  it('uses the original AI dataId for submit agentAsk', () => {
    const interactive = {
      ...baseInteractive,
      type: 'agentAsk',
      askId: 'chat-agent-helper-ask',
      responseMode: 'submit',
      params: {
        description: 'Need input',
        questions: [
          {
            question: 'Need input?',
            options: [
              { summary: 'A', value: 'A' },
              { summary: 'B', value: 'B' }
            ],
            answer: ''
          }
        ]
      }
    } as WorkflowInteractiveResponseType;

    expect(
      resolveInteractiveResponseChatItemId({
        histories: [createAiRecord(interactive, { dataId: 'old-ai-1' })],
        interactive,
        interactiveVal: JSON.stringify({ answers: ['A'] }),
        responseChatItemId: 'new-response-id'
      })
    ).toBe('old-ai-1');
  });

  it('falls back to the new responseChatItemId when no previous AI item exists', () => {
    const interactive = createUserInputInteractive();

    expect(
      resolveInteractiveResponseChatItemId({
        histories: [createHumanRecord('human-1')],
        interactive,
        interactiveVal: JSON.stringify({ name: 'FastGPT' }),
        responseChatItemId: 'new-response-id'
      })
    ).toBe('new-response-id');
  });
});
