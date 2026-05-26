import { describe, expect, it } from 'vitest';
import { ChatRoleEnum, ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  hasMeaningfulAiOutput,
  shouldCreateResumeAiPlaceholder
} from '@/components/core/chat/ChatContainer/ChatBox/utils/resume';
import type { ChatSiteItemType } from '@/components/core/chat/ChatContainer/ChatBox/type';

const createAiRecord = (override: Partial<ChatSiteItemType>): ChatSiteItemType =>
  ({
    id: 'ai-1',
    dataId: 'ai-1',
    obj: ChatRoleEnum.AI,
    value: [],
    status: ChatStatusEnum.loading,
    ...override
  }) as ChatSiteItemType;

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
