import { describe, expect, it } from 'vitest';
import { ChatRoleEnum, ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { ChatSiteItemType } from '@/components/core/chat/ChatContainer/ChatBox/type';
import {
  getInteractiveByHistories,
  isPendingAgentAsk,
  isPendingWorkflowBuilderPreview,
  isUserInputInteractiveSubmitted,
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
  it.each([false, true])(
    'derives pending Ask from the adjacent user (answered: %s)',
    (answered) => {
      const interactive: WorkflowInteractiveResponseType = {
        ...baseInteractive,
        type: 'agentAsk',
        askId: 'ask-1',
        params: {
          description: '',
          questions: [
            {
              question: 'Choose?',
              options: [
                { summary: 'A', value: 'A' },
                { summary: 'B', value: 'B' }
              ]
            }
          ]
        }
      };
      for (const source of [
        interactive,
        {
          ...baseInteractive,
          type: 'childrenInteractive' as const,
          params: { childrenResponse: interactive }
        }
      ]) {
        const records = [createAiRecord(source), ...(answered ? [createHumanRecord()] : [])];
        expect(getInteractiveByHistories(records)).toEqual({
          interactive: answered ? undefined : interactive,
          canSendQuery: true
        });
      }
    }
  );

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

  it('blocks the normal input while a workflow builder preview awaits confirmation', () => {
    const interactive = {
      ...baseInteractive,
      type: 'workflowBuilderPreview',
      previewId: 'preview-1',
      params: {
        title: 'Confirm workflow',
        mermaid: 'flowchart LR\n  A --> B',
        sections: [],
        actions: [
          { value: 'confirm', label: 'Confirm', inputMode: 'none' },
          { value: 'revise', label: 'Revise', inputMode: 'text' },
          { value: 'cancel', label: 'Cancel', inputMode: 'none' }
        ]
      }
    } satisfies WorkflowInteractiveResponseType;

    const pending = getInteractiveByHistories([createAiRecord(interactive)]);
    expect(pending).toEqual({ interactive, canSendQuery: false });
    expect(isPendingWorkflowBuilderPreview(pending.interactive)).toBe(true);

    expect(getInteractiveByHistories([createAiRecord(interactive), createHumanRecord()])).toEqual({
      interactive: undefined,
      canSendQuery: true
    });
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
              ]
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
            ]
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

describe('Ask and Preview immutable questions', () => {
  it.each(['agentAsk', 'workflowBuilderPreview'] as const)(
    'keeps the original %s and the new structured user round unchanged',
    (type) => {
      const interactive =
        type === 'agentAsk'
          ? {
              ...baseInteractive,
              type,
              askId: 'ask-1',
              params: {
                description: '',
                questions: [
                  {
                    question: 'Choose?',
                    options: [
                      { summary: 'A', value: 'A' },
                      { summary: 'B', value: 'B' }
                    ]
                  }
                ]
              }
            }
          : {
              ...baseInteractive,
              type,
              previewId: 'preview-1',
              params: {
                title: 'Confirm?',
                mermaid: 'flowchart LR; A --> B',
                sections: [],
                actions: [
                  { value: 'confirm' as const, label: 'Confirm', inputMode: 'none' as const },
                  { value: 'revise' as const, label: 'Revise', inputMode: 'text' as const },
                  { value: 'cancel' as const, label: 'Cancel', inputMode: 'none' as const }
                ]
              }
            };
      const human: ChatSiteItemType = {
        ...createHumanRecord(),
        obj: ChatRoleEnum.Human,
        value: [
          {
            select: {
              type,
              questions: [{ question: 'Choose?', value: type === 'agentAsk' ? 'A' : 'confirm' }]
            }
          }
        ]
      };
      const histories = [createAiRecord(interactive), human, createAiPlaceholder()];
      const original = structuredClone(histories);
      const result = rewriteHistoriesByInteractiveResponse({
        histories,
        interactive,
        interactiveVal: ''
      });
      expect(result).toEqual(original);
      expect(histories).toEqual(original);
      expect(result[1].value[0]).not.toHaveProperty('askId');
      expect(result[1].value[0]).not.toHaveProperty('interactiveReply');
    }
  );
});
