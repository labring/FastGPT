import { describe, expect, it } from 'vitest';
import { ChatRoleEnum, ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  hasMeaningfulAiOutput,
  mergeResumeCompletedChatRecords,
  shouldCreateResumeAiPlaceholder
} from '@/components/core/chat/ChatContainer/ChatBox/utils/resume';
import { appendNodeResponseByParent } from '@fastgpt/global/core/chat/utils';
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
  });

  it('returns false for stream control events that do not create chat content', () => {
    expect(shouldCreateResumeAiPlaceholder(SseResponseEventEnum.error)).toBe(false);
    expect(shouldCreateResumeAiPlaceholder(SseResponseEventEnum.updateVariables)).toBe(false);
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

describe('appendNodeResponseByParent', () => {
  it('appends root node responses when parentId is missing', () => {
    const result = appendNodeResponseByParent(
      [createNodeResponse({ id: 'root-1' })],
      createNodeResponse({ id: 'root-2' })
    );

    expect(result.map((item) => item.id)).toEqual(['root-1', 'root-2']);
  });

  it('inserts child node responses under matching id', () => {
    const result = appendNodeResponseByParent(
      [
        createNodeResponse({
          id: 'response-root'
        })
      ],
      createNodeResponse({
        id: 'response-child',
        parentId: 'response-root'
      })
    );

    expect(result).toHaveLength(1);
    expect(result[0].childrenResponses?.map((item) => item.id)).toEqual(['response-child']);
  });

  it('falls back to root append when parent is not present in stream state', () => {
    const result = appendNodeResponseByParent(
      [createNodeResponse({ id: 'root' })],
      createNodeResponse({
        id: 'orphan',
        parentId: 'missing-parent'
      })
    );

    expect(result.map((item) => item.id)).toEqual(['root', 'orphan']);
  });

  it('moves earlier child root under parent when parent arrives later', () => {
    const withOrphan = appendNodeResponseByParent(
      [],
      createNodeResponse({
        id: 'response-child',
        parentId: 'response-root'
      })
    );

    const result = appendNodeResponseByParent(
      withOrphan,
      createNodeResponse({
        id: 'response-root'
      })
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('response-root');
    expect(result[0].childrenResponses?.map((item) => item.id)).toEqual(['response-child']);
  });

  it('updates duplicate node responses instead of appending duplicate rows', () => {
    const result = appendNodeResponseByParent(
      [
        createNodeResponse({
          id: 'response-root',
          runningTime: 1
        })
      ],
      createNodeResponse({
        id: 'response-root',
        runningTime: 2,
        childrenResponses: [createNodeResponse({ id: 'child' })]
      })
    );

    expect(result).toHaveLength(1);
    expect(result[0].runningTime).toBe(2);
    expect(result[0].childrenResponses?.map((item) => item.id)).toEqual(['child']);
  });

  it('inserts children under parents stored in legacy child fields', () => {
    const result = appendNodeResponseByParent(
      [
        createNodeResponse({
          id: 'agent',
          toolDetail: [
            createNodeResponse({
              id: 'tool-parent-response'
            })
          ]
        })
      ],
      createNodeResponse({
        id: 'tool-child-response',
        parentId: 'tool-parent-response'
      })
    );

    expect(result).toHaveLength(1);
    expect(result[0].toolDetail?.[0].childrenResponses?.map((item) => item.id)).toEqual([
      'tool-child-response'
    ]);
  });

  it('updates duplicate childrenResponses items instead of appending duplicate rows', () => {
    const result = appendNodeResponseByParent(
      [
        createNodeResponse({
          id: 'agent',
          childrenResponses: [
            createNodeResponse({
              id: 'legacy-child',
              runningTime: 1
            })
          ]
        })
      ],
      createNodeResponse({
        id: 'legacy-child',
        parentId: 'agent',
        runningTime: 2
      })
    );

    expect(result).toHaveLength(1);
    expect(result[0].childrenResponses?.[0]).toMatchObject({
      id: 'legacy-child',
      parentId: 'agent',
      runningTime: 2
    });
    expect(result[0].childrenResponses).toHaveLength(1);
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
