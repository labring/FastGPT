import { describe, expect, it } from 'vitest';
import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatHistoryItemType } from '@fastgpt/global/core/chat/type';
import {
  getDisplayHistoryTitle,
  upsertHistoryTitle
} from '@/web/core/chat/context/historyTitleUtils';

const appId = 'app-1';
const chatId = 'chat-1';
const now = new Date('2026-05-13T08:00:00.000Z');

const createHistory = (override: Partial<ChatHistoryItemType> = {}): ChatHistoryItemType => ({
  appId,
  chatId,
  title: 'old title',
  customTitle: '',
  top: false,
  updateTime: new Date('2026-05-13T07:00:00.000Z'),
  chatGenerateStatus: ChatGenerateStatusEnum.done,
  hasBeenRead: true,
  ...override
});

describe('historyTitleUtils', () => {
  it('should prefer non-empty title and fallback when title is blank', () => {
    expect(
      getDisplayHistoryTitle({
        title: ' user question ',
        fallbackTitle: '新对话'
      })
    ).toBe('user question');
    expect(
      getDisplayHistoryTitle({
        title: '   ',
        fallbackTitle: '新对话'
      })
    ).toBe('新对话');
  });

  it('should insert a temporary history with user input title', () => {
    const result = upsertHistoryTitle({
      histories: [],
      appId,
      chatId,
      title: 'What is FastGPT?',
      fallbackTitle: '新对话',
      now
    });

    expect(result).toEqual([
      {
        appId,
        chatId,
        title: 'What is FastGPT?',
        customTitle: '',
        top: false,
        updateTime: now,
        chatGenerateStatus: ChatGenerateStatusEnum.generating,
        hasBeenRead: false
      }
    ]);
  });

  it('should replace existing temporary title with server title without duplicating history', () => {
    const otherHistory = createHistory({
      chatId: 'chat-2',
      title: 'other title'
    });
    const result = upsertHistoryTitle({
      histories: [
        createHistory({
          title: '新对话',
          chatGenerateStatus: ChatGenerateStatusEnum.generating,
          hasBeenRead: false
        }),
        otherHistory
      ],
      appId,
      chatId,
      title: 'server generated title',
      fallbackTitle: '新对话',
      now
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      ...createHistory({
        title: 'server generated title',
        chatGenerateStatus: ChatGenerateStatusEnum.generating,
        hasBeenRead: false
      }),
      updateTime: now
    });
    expect(result[1]).toBe(otherHistory);
  });
});
