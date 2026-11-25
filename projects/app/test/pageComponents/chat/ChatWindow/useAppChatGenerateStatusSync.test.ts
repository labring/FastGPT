import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatGenerateStatusEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatHistoryItemType } from '@fastgpt/global/core/chat/type';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { useAppChatGenerateStatusSync } from '@/pageComponents/chat/ChatWindow/useAppChatGenerateStatusSync';
import type { ChatGenerateStatusChangeHandler } from '@/components/core/chat/ChatContainer/ChatBox/type';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

let dom: JSDOM;
let container: HTMLDivElement;
let root: Root | null = null;

beforeAll(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>');
  Object.defineProperties(globalThis, {
    window: { value: dom.window, configurable: true },
    document: { value: dom.window.document, configurable: true },
    HTMLElement: { value: dom.window.HTMLElement, configurable: true },
    IS_REACT_ACT_ENVIRONMENT: { value: true, configurable: true }
  });
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
    root = null;
  }
  container?.remove();
});

afterAll(() => {
  dom?.window.close();
});

describe('useAppChatGenerateStatusSync', () => {
  let histories: ChatHistoryItemType[];
  let loadHistories: ReturnType<typeof vi.fn>;
  let syncHandler: ChatGenerateStatusChangeHandler;

  const setHistories: React.Dispatch<React.SetStateAction<ChatHistoryItemType[]>> = (updater) => {
    histories = typeof updater === 'function' ? updater(histories) : updater;
  };

  const renderHook = async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const Harness = () => {
      syncHandler = useAppChatGenerateStatusSync();
      return null;
    };

    await act(async () => {
      root?.render(
        React.createElement(
          ChatContext.Provider,
          {
            value: {
              ...(ChatContext as any)._currentValue,
              histories,
              setHistories,
              loadHistories
            }
          },
          React.createElement(
            ChatItemContext.Provider,
            {
              value: {
                ...(ChatItemContext as any)._currentValue,
                chatBoxData: { title: '' }
              }
            },
            React.createElement(Harness)
          )
        )
      );
    });
  };

  beforeEach(async () => {
    histories = [];
    loadHistories = vi.fn();
    await renderHook();
  });

  it('inserts a new chat optimistically on generating, updates title, and silently reloads page 1 on done', async () => {
    const sourceTarget = { sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' } as const;

    syncHandler({
      sourceTarget,
      chatId: 'chat-1',
      status: ChatGenerateStatusEnum.generating,
      hasBeenRead: false
    });
    await Promise.resolve();

    expect(histories).toHaveLength(1);
    expect(histories[0]).toMatchObject({
      chatId: 'chat-1',
      appId: 'app-1',
      chatGenerateStatus: ChatGenerateStatusEnum.generating,
      hasBeenRead: false
    });
    // 生成刚开始时不抢跑重拉，避免在写库前覆写乐观条目
    expect(loadHistories).not.toHaveBeenCalled();

    syncHandler({
      sourceTarget,
      chatId: 'chat-1',
      status: ChatGenerateStatusEnum.generating,
      title: '2026-11-25 18:30:00 Wednesday'
    });
    expect(histories[0].title).toBe('2026-11-25 18:30:00 Wednesday');
    expect(loadHistories).not.toHaveBeenCalled();

    syncHandler({
      sourceTarget,
      chatId: 'chat-1',
      status: ChatGenerateStatusEnum.done,
      hasBeenRead: true
    });
    await Promise.resolve();

    expect(histories[0]).toMatchObject({
      chatId: 'chat-1',
      title: '2026-11-25 18:30:00 Wednesday',
      chatGenerateStatus: ChatGenerateStatusEnum.done,
      hasBeenRead: true
    });
    expect(loadHistories).toHaveBeenCalledExactlyOnceWith({ init: true, silent: true });
  });

  it('triggers silent init reload directly when a new chat finishes without a prior generating event', async () => {
    syncHandler({
      sourceTarget: { sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' },
      chatId: 'chat-2',
      status: ChatGenerateStatusEnum.done,
      hasBeenRead: true
    });
    await Promise.resolve();

    expect(histories).toHaveLength(1);
    expect(loadHistories).toHaveBeenCalledExactlyOnceWith({ init: true, silent: true });
  });

  it('does not reload history list when an already persisted chat finishes another round', async () => {
    histories = [
      {
        chatId: 'existing-chat',
        appId: 'app-1',
        title: 'Existing',
        customTitle: '',
        top: false,
        updateTime: new Date(),
        chatGenerateStatus: ChatGenerateStatusEnum.done,
        hasBeenRead: true
      }
    ];

    syncHandler({
      sourceTarget: { sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' },
      chatId: 'existing-chat',
      status: ChatGenerateStatusEnum.done,
      hasBeenRead: true
    });
    await Promise.resolve();

    expect(loadHistories).not.toHaveBeenCalled();
  });
});
