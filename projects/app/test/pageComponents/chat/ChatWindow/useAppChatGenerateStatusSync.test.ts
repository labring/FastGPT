import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatGenerateStatusEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { useContextSelector } from 'use-context-selector';
import ChatContextProvider, { ChatContext } from '@/web/core/chat/context/chatContext';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { useAppChatGenerateStatusSync } from '@/pageComponents/chat/ChatWindow/useAppChatGenerateStatusSync';
import type { ChatGenerateStatusChangeHandler } from '@/components/core/chat/ChatContainer/ChatBox/type';

const mocks = vi.hoisted(() => ({
  getHistories: vi.fn(),
  getHistoryStatus: vi.fn()
}));

vi.mock('@/web/core/chat/history/api', () => ({
  getChatHistories: mocks.getHistories,
  getChatHistoryStatus: mocks.getHistoryStatus,
  putChatHistory: vi.fn(),
  delChatHistoryById: vi.fn(),
  delClearChatHistories: vi.fn()
}));
vi.mock('next/router', () => ({ useRouter: () => ({ query: {}, replace: vi.fn() }) }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

let dom: JSDOM;
let container: HTMLDivElement;
let root: Root | null = null;

beforeAll(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://fastgpt.example' });
  Object.defineProperties(globalThis, {
    window: { value: dom.window, configurable: true },
    document: { value: dom.window.document, configurable: true },
    HTMLElement: { value: dom.window.HTMLElement, configurable: true },
    localStorage: { value: dom.window.localStorage, configurable: true },
    sessionStorage: { value: dom.window.sessionStorage, configurable: true },
    IS_REACT_ACT_ENVIRONMENT: { value: true, configurable: true }
  });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
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

describe('useAppChatGenerateStatusSync + ChatContextProvider', () => {
  let ctx!: React.ContextType<typeof ChatContext>;
  let syncHandler!: ChatGenerateStatusChangeHandler;

  const renderTree = async (initialServerList: any[] = []) => {
    mocks.getHistories.mockResolvedValue({
      list: initialServerList,
      total: initialServerList.length
    });
    mocks.getHistoryStatus.mockResolvedValue({ list: [] });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const Harness = () => {
      ctx = useContextSelector(ChatContext, (v) => v);
      syncHandler = useAppChatGenerateStatusSync();
      return null;
    };

    await act(async () => {
      root?.render(
        React.createElement(
          ChatContextProvider,
          { params: { appId: 'app-1' } } as React.ComponentProps<typeof ChatContextProvider>,
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
      await Promise.resolve();
    });
    mocks.getHistories.mockClear();
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a new chat optimistically on generating, updates title, and silently reloads page 1 on done', async () => {
    await renderTree();
    const sourceTarget = { sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' } as const;

    await act(async () => {
      syncHandler({
        sourceTarget,
        chatId: 'chat-1',
        status: ChatGenerateStatusEnum.generating,
        hasBeenRead: false
      });
      await Promise.resolve();
    });

    expect(ctx.histories).toHaveLength(1);
    expect(ctx.histories[0]).toMatchObject({
      chatId: 'chat-1',
      appId: 'app-1',
      chatGenerateStatus: ChatGenerateStatusEnum.generating,
      hasBeenRead: false
    });
    // 生成刚开始时不抢跑重拉，避免在写库前覆写乐观条目
    expect(mocks.getHistories).not.toHaveBeenCalled();

    await act(async () => {
      syncHandler({
        sourceTarget,
        chatId: 'chat-1',
        status: ChatGenerateStatusEnum.generating,
        title: '2026-11-25 18:30:00 Wednesday'
      });
    });
    expect(ctx.histories[0].title).toBe('2026-11-25 18:30:00 Wednesday');
    expect(mocks.getHistories).not.toHaveBeenCalled();

    mocks.getHistories.mockResolvedValueOnce({
      list: [
        {
          chatId: 'chat-1',
          appId: 'app-1',
          title: '2026-11-25 18:30:00 Wednesday',
          customTitle: '',
          top: false,
          updateTime: new Date(),
          chatGenerateStatus: ChatGenerateStatusEnum.done,
          hasBeenRead: true
        }
      ],
      total: 1
    });

    await act(async () => {
      syncHandler({
        sourceTarget,
        chatId: 'chat-1',
        status: ChatGenerateStatusEnum.done,
        hasBeenRead: true
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.getHistories).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ offset: 0, pageSize: 20, appId: 'app-1' })
    );
    expect(ctx.histories[0]).toMatchObject({
      chatId: 'chat-1',
      title: '2026-11-25 18:30:00 Wednesday',
      chatGenerateStatus: ChatGenerateStatusEnum.done,
      hasBeenRead: true
    });
  });

  it('triggers silent init reload directly when a new chat finishes without a prior generating event', async () => {
    await renderTree();

    await act(async () => {
      syncHandler({
        sourceTarget: { sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' },
        chatId: 'chat-2',
        status: ChatGenerateStatusEnum.done,
        hasBeenRead: true
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.getHistories).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ offset: 0, pageSize: 20, appId: 'app-1' })
    );
  });

  it('does not reload history list when an already persisted chat finishes another round', async () => {
    await renderTree([
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
    ]);

    await act(async () => {
      syncHandler({
        sourceTarget: { sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' },
        chatId: 'existing-chat',
        status: ChatGenerateStatusEnum.done,
        hasBeenRead: true
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.getHistories).not.toHaveBeenCalled();
  });
});
