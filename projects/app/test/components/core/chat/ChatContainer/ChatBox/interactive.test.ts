import { describe, expect, it } from 'vitest';
import { ChatRoleEnum, ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { ChatSiteItemType } from '@/components/core/chat/ChatContainer/ChatBox/type';
import {
  getInteractiveByHistories,
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

const createUserInputInteractive = (submitted = false): WorkflowInteractiveResponseType =>
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

  it('allows sending a query while preserving agent plan ask interactive', () => {
    const interactive = {
      ...baseInteractive,
      type: 'agentPlanAskQuery',
      params: {
        content: 'Need more detail',
        options: ['A', 'B', 'C']
      }
    } as WorkflowInteractiveResponseType;

    expect(getInteractiveByHistories([createAiRecord(interactive)])).toEqual({
      interactive,
      canSendQuery: true
    });
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

  it('keeps the temporary user round when agentPlanAskQuery becomes a normal query', () => {
    const interactive = {
      ...baseInteractive,
      type: 'agentPlanAskQuery',
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
});
