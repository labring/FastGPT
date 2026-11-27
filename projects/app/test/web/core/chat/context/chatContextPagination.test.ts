import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useContextSelector } from 'use-context-selector';
import ChatContextProvider, { ChatContext } from '@/web/core/chat/context/chatContext';
import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';

const mocks = vi.hoisted(() => ({
  poll: vi.fn(),
  getHistories: vi.fn()
}));

vi.mock('@/web/core/chat/history/api', () => ({
  getChatHistoryStatus: mocks.poll,
  getChatHistories: mocks.getHistories,
  putChatHistory: vi.fn(),
  delChatHistoryById: vi.fn(),
  delClearChatHistories: vi.fn()
}));
vi.mock('next/router', () => ({ useRouter: () => ({ query: {}, replace: vi.fn() }) }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const createServerHistories = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    appId: 'app',
    chatId: `server-${index + 1}`,
    title: `Server ${index + 1}`,
    updateTime: new Date(),
    chatGenerateStatus: ChatGenerateStatusEnum.done,
    hasBeenRead: true
  }));

describe('ChatContextProvider real pagination with pending optimistic histories', () => {
  let dom: JSDOM;
  let root: Root | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.poll.mockResolvedValue({ list: [] });
    dom = new JSDOM('<div id="root"></div>', { url: 'https://fastgpt.example' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('localStorage', dom.window.localStorage);
    vi.stubGlobal('sessionStorage', dom.window.sessionStorage);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    root = createRoot(document.getElementById('root')!);
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  const mountWithServerRecords = async (totalCount: number) => {
    const allServerRecords = createServerHistories(totalCount);
    mocks.getHistories.mockImplementation(async ({ offset = 0, pageSize = 20 }) => ({
      list: allServerRecords.slice(offset, offset + pageSize),
      total: allServerRecords.length
    }));

    let ctx!: React.ContextType<typeof ChatContext>;
    const Probe = () => {
      ctx = useContextSelector(ChatContext, (v) => v);
      return null;
    };

    await act(async () => {
      root!.render(
        React.createElement(
          ChatContextProvider,
          {
            params: { outLinkAuthData: { shareId: 'share', outLinkUid: 'uid' } }
          } as React.ComponentProps<typeof ChatContextProvider>,
          React.createElement(Probe)
        )
      );
      await Promise.resolve();
    });

    return {
      getCtx: () => ctx
    };
  };

  it('keeps server pagination offset at 20 and does not skip record #21 when an optimistic generating chat is pending', async () => {
    const { getCtx } = await mountWithServerRecords(25);
    expect(getCtx().histories).toHaveLength(20);

    // 插入未落库的乐观 generating 会话 A，并触发首屏静默刷新（如另一会话 B 完成）
    await act(async () => {
      getCtx().syncHistoryStatus({
        appId: 'app',
        chatId: 'pending-a',
        status: ChatGenerateStatusEnum.generating,
        hasBeenRead: false,
        title: 'Pending A'
      });
    });

    await act(async () => {
      await getCtx().loadHistories({ init: true, silent: true });
    });

    expect(getCtx().histories[0]?.chatId).toBe('pending-a');
    expect(getCtx().histories).toHaveLength(21);

    mocks.getHistories.mockClear();
    await act(async () => {
      await getCtx().loadHistories({ init: false });
    });

    expect(mocks.getHistories).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ offset: 20, pageSize: 20 })
    );
    expect(getCtx().histories.map((item) => item.chatId)).toContain('server-21');
    expect(getCtx().histories).toHaveLength(26);
  });

  it('does not prematurely stop pagination when server total is 21 and an optimistic generating chat is pending', async () => {
    const { getCtx } = await mountWithServerRecords(21);
    expect(getCtx().histories).toHaveLength(20);

    await act(async () => {
      getCtx().syncHistoryStatus({
        appId: 'app',
        chatId: 'pending-a',
        status: ChatGenerateStatusEnum.generating,
        hasBeenRead: false,
        title: 'Pending A'
      });
    });

    await act(async () => {
      await getCtx().loadHistories({ init: true, silent: true });
    });

    expect(getCtx().histories).toHaveLength(21);

    mocks.getHistories.mockClear();
    await act(async () => {
      await getCtx().loadHistories({ init: false });
    });

    expect(mocks.getHistories).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ offset: 20, pageSize: 20 })
    );
    expect(getCtx().histories.map((item) => item.chatId)).toEqual([
      'pending-a',
      ...Array.from({ length: 21 }, (_, index) => `server-${index + 1}`)
    ]);
  });
});
