import { describe, expect, it, vi } from 'vitest';
import { ChatRoleEnum, ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { AuxiliaryGenerationEventEnum } from '@fastgpt/global/core/ai/auxiliaryGeneration/constants';
import {
  getLastAiDataId,
  hasMeaningfulAiOutput,
  mergeResumeCompletedChatRecords,
  shouldCheckChatResumeStatus,
  shouldCreateResumeAiPlaceholder,
  waitForConflictRecoveryRecords
} from '@/components/core/chat/ChatContainer/ChatBox/utils/resume';
import type { ChatSiteItemType } from '@/components/core/chat/ChatContainer/ChatBox/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';

const createAiRecord = (override: Partial<ChatSiteItemType>): ChatSiteItemType =>
  ({
    id: 'ai-1',
    dataId: 'ai-1',
    obj: ChatRoleEnum.AI,
    value: [],
    status: ChatStatusEnum.loading,
    ...override
  }) as ChatSiteItemType;

const createHumanRecord = (override: Partial<ChatSiteItemType>): ChatSiteItemType =>
  ({
    id: 'human-1',
    dataId: 'human-1',
    obj: ChatRoleEnum.Human,
    value: [],
    status: ChatStatusEnum.finish,
    ...override
  }) as ChatSiteItemType;

const createNodeResponse = (
  override: Partial<ChatHistoryItemResType> & { id: string }
): ChatHistoryItemResType => ({
  nodeId: override.id,
  moduleName: override.id,
  moduleType: FlowNodeTypeEnum.agent,
  ...override
});

describe('shouldCreateResumeAiPlaceholder', () => {
  it('returns true for visible resume stream events', () => {
    expect(shouldCreateResumeAiPlaceholder(SseResponseEventEnum.flowNodeResponse)).toBe(true);
    expect(shouldCreateResumeAiPlaceholder(SseResponseEventEnum.answer)).toBe(true);
    expect(shouldCreateResumeAiPlaceholder(SseResponseEventEnum.fastAnswer)).toBe(true);
    expect(shouldCreateResumeAiPlaceholder(SseResponseEventEnum.toolCall)).toBe(true);
    expect(shouldCreateResumeAiPlaceholder(SseResponseEventEnum.toolParams)).toBe(true);
    expect(shouldCreateResumeAiPlaceholder(SseResponseEventEnum.toolResponse)).toBe(true);
    expect(shouldCreateResumeAiPlaceholder(SseResponseEventEnum.interactive)).toBe(true);
    expect(shouldCreateResumeAiPlaceholder(SseResponseEventEnum.plan)).toBe(true);
    expect(shouldCreateResumeAiPlaceholder(SseResponseEventEnum.planStatus)).toBe(true);
    expect(shouldCreateResumeAiPlaceholder(SseResponseEventEnum.workflowDuration)).toBe(true);
    expect(shouldCreateResumeAiPlaceholder(AuxiliaryGenerationEventEnum.status)).toBe(true);
  });

  it('returns false for stream control events that do not create chat content', () => {
    expect(shouldCreateResumeAiPlaceholder(SseResponseEventEnum.error)).toBe(false);
    expect(shouldCreateResumeAiPlaceholder(SseResponseEventEnum.updateVariables)).toBe(false);
  });
});

describe('shouldCheckChatResumeStatus', () => {
  const validParams = {
    enableAutoResume: true,
    isReady: true,
    isChatRecordsLoaded: true,
    sourceKey: 'app:app-1',
    chatId: 'chat-1',
    isChatting: false,
    isResumeRequestActive: false,
    chatBoxSourceKey: 'app:app-1',
    chatBoxChatId: 'chat-1'
  };

  it('checks server status when the visible chat has no local stream', () => {
    expect(shouldCheckChatResumeStatus(validParams)).toBe(true);
  });

  it.each([
    { enableAutoResume: false },
    { isReady: false },
    { isChatRecordsLoaded: false },
    { sourceKey: undefined },
    { chatId: undefined },
    { isChatting: true },
    { isResumeRequestActive: true },
    { chatBoxSourceKey: 'app:other' },
    { chatBoxChatId: 'chat-other' }
  ])('skips checks for an ineligible local state: %o', (override) => {
    expect(
      shouldCheckChatResumeStatus({
        ...validParams,
        ...override
      })
    ).toBe(false);
  });
});

describe('chat generating conflict recovery', () => {
  it('uses the server round id after refreshing records', () => {
    const recoveredRecords = [
      createHumanRecord({ id: 'old-human', dataId: 'old-round' }),
      createAiRecord({ id: 'old-ai', dataId: 'old-round', status: ChatStatusEnum.finish }),
      createHumanRecord({ id: 'active-human', dataId: 'active-round' }),
      createAiRecord({ id: 'active-ai', dataId: 'active-round' })
    ];

    expect(getLastAiDataId(recoveredRecords)).toBe('active-round');
  });

  it('waits until a newly pre-created round becomes visible', async () => {
    const oldRecords = [createAiRecord({ dataId: 'old-round' })];
    const activeRecords = [
      ...oldRecords,
      createHumanRecord({ dataId: 'active-round' }),
      createAiRecord({ dataId: 'active-round' })
    ];
    let calls = 0;

    await expect(
      waitForConflictRecoveryRecords({
        loadRecords: async () => (++calls === 1 ? oldRecords : activeRecords),
        previousAiDataId: 'old-round',
        canReusePreviousAi: false,
        retryIntervalMs: 0
      })
    ).resolves.toEqual(activeRecords);
    expect(calls).toBe(2);
  });

  it('accepts the previous AI id for an interactive continuation', async () => {
    const records = [createAiRecord({ dataId: 'interactive-round' })];

    await expect(
      waitForConflictRecoveryRecords({
        loadRecords: async () => records,
        previousAiDataId: 'interactive-round',
        canReusePreviousAi: true,
        retryIntervalMs: 0
      })
    ).resolves.toEqual(records);
  });

  it('retries a transient record refresh failure', async () => {
    const activeRecords = [createAiRecord({ dataId: 'active-round' })];
    let calls = 0;

    await expect(
      waitForConflictRecoveryRecords({
        loadRecords: async () => {
          if (++calls === 1) throw new Error('Temporary failure');
          return activeRecords;
        },
        previousAiDataId: 'old-round',
        canReusePreviousAi: false,
        retryIntervalMs: 0
      })
    ).resolves.toEqual(activeRecords);
    expect(calls).toBe(2);
  });

  it('stops after the configured attempts when the active round is not visible', async () => {
    const records = [createAiRecord({ dataId: 'old-round' })];
    let calls = 0;

    await expect(
      waitForConflictRecoveryRecords({
        loadRecords: async () => {
          calls++;
          return records;
        },
        previousAiDataId: 'old-round',
        canReusePreviousAi: false,
        maxAttempts: 3,
        retryIntervalMs: 0
      })
    ).resolves.toBeUndefined();
    expect(calls).toBe(3);
  });

  it('does not refresh records after the resume target is aborted', async () => {
    const controller = new AbortController();
    const loadRecords = vi.fn(async () => [createAiRecord({ dataId: 'active-round' })]);
    controller.abort('leave');

    await expect(
      waitForConflictRecoveryRecords({
        loadRecords,
        previousAiDataId: 'old-round',
        canReusePreviousAi: false,
        signal: controller.signal,
        retryIntervalMs: 0
      })
    ).resolves.toBeUndefined();
    expect(loadRecords).not.toHaveBeenCalled();
  });
});

describe('hasMeaningfulAiOutput', () => {
  it('returns false when the record is missing, human, or empty AI placeholder', () => {
    expect(hasMeaningfulAiOutput()).toBe(false);
    expect(
      hasMeaningfulAiOutput({
        id: 'human-1',
        dataId: 'human-1',
        obj: ChatRoleEnum.Human,
        value: [],
        status: ChatStatusEnum.finish
      } as ChatSiteItemType)
    ).toBe(false);
    expect(hasMeaningfulAiOutput(createAiRecord({ value: [] }))).toBe(false);
    expect(
      hasMeaningfulAiOutput(
        createAiRecord({
          value: [
            {
              text: {
                content: ''
              }
            }
          ]
        })
      )
    ).toBe(false);
  });

  it('returns true for AI records with response data or visible value content', () => {
    expect(
      hasMeaningfulAiOutput(
        createAiRecord({
          responseData: [{} as any]
        })
      )
    ).toBe(true);
    expect(
      hasMeaningfulAiOutput(
        createAiRecord({
          value: [
            {
              text: {
                content: 'answer'
              }
            }
          ]
        })
      )
    ).toBe(true);
    expect(
      hasMeaningfulAiOutput(
        createAiRecord({
          value: [
            {
              reasoning: {
                content: 'reasoning'
              }
            }
          ]
        })
      )
    ).toBe(true);
    expect(
      hasMeaningfulAiOutput(
        createAiRecord({
          value: [
            {
              tools: [
                {
                  id: 'tool-1',
                  name: 'tool',
                  params: '{}'
                } as any
              ]
            }
          ]
        })
      )
    ).toBe(true);
    expect(
      hasMeaningfulAiOutput(
        createAiRecord({
          value: [
            {
              skills: [
                {
                  id: 'skill-1',
                  skillName: 'skill',
                  skillAvatar: '',
                  description: '',
                  skillMdPath: '/tmp/skill.md'
                }
              ]
            }
          ]
        })
      )
    ).toBe(true);
    expect(
      hasMeaningfulAiOutput(
        createAiRecord({
          value: [
            {
              plan: {} as any
            }
          ]
        })
      )
    ).toBe(true);
    expect(
      hasMeaningfulAiOutput(
        createAiRecord({
          value: [
            {
              interactive: {} as any
            }
          ]
        })
      )
    ).toBe(true);
  });
});

describe('mergeResumeCompletedChatRecords', () => {
  it('merges replayed children into matching completed responseData nodes', () => {
    const completed = createAiRecord({
      dataId: 'response-ai',
      responseData: [
        createNodeResponse({
          id: 'root-response'
        })
      ]
    });
    const current = createAiRecord({
      dataId: 'response-ai',
      responseData: [
        createNodeResponse({
          id: 'root-response',
          childrenResponses: [
            createNodeResponse({
              id: 'child-response',
              parentId: 'root-response'
            })
          ]
        })
      ]
    });

    const result = mergeResumeCompletedChatRecords({
      currentRecords: [current],
      completedRecords: [completed],
      responseChatId: 'response-ai'
    });

    const aiRecord = result[0] as Extract<ChatSiteItemType, { obj: ChatRoleEnum.AI }>;
    expect(aiRecord.responseData?.[0].childrenResponses?.map((item) => item.id)).toEqual([
      'child-response'
    ]);
  });
});
