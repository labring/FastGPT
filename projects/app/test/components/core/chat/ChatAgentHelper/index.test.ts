import React, { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatAgentHelperRefType } from '@/components/core/chat/ChatAgentHelper';
import { ChatAgentHelperTypeEnum } from '@fastgpt/global/core/ai/auxiliaryGeneration/constants';
import type { UserType } from '@fastgpt/global/support/user/type';

const mocks = vi.hoisted(() => ({
  batchDeleteChatHistories: vi.fn(),
  getChatHistories: vi.fn(),
  getInitChatInfo: vi.fn(),
  clearChatRecords: vi.fn(),
  setChatBoxData: vi.fn()
}));

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/web/core/chat/history/api', () => ({
  batchDeleteChatHistories: mocks.batchDeleteChatHistories,
  getChatHistories: mocks.getChatHistories
}));
vi.mock('@/web/core/chat/api', () => ({ getInitChatInfo: mocks.getInitChatInfo }));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: (select: (state: unknown) => unknown) => select({ feConfigs: {} })
}));
vi.mock('@/components/core/chat/ChatContainer/ChatBox', () => ({
  default: ({ chatId }: { chatId: string }) =>
    React.createElement('div', { 'data-chat-id': chatId })
}));
vi.mock('@/web/core/chat/context/chatItemContext', async () => {
  const { createContext } = await import('use-context-selector');
  return {
    default: ({ children }: { children: React.ReactNode }) => children,
    ChatItemContext: createContext({
      setChatBoxData: mocks.setChatBoxData,
      clearChatRecords: mocks.clearChatRecords
    })
  };
});
vi.mock('@/web/core/chat/context/chatRecordContext', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@chakra-ui/react', () => {
  const Container = ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children);
  return {
    Flex: Container,
    Text: Container,
    Spinner: () => React.createElement('div', { role: 'status' }),
    Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) =>
      React.createElement('button', { onClick }, children)
  };
});

describe('ChatAgentHelper new conversation', () => {
  let dom: JSDOM;
  let root: Root;
  let ChatAgentHelper: typeof import('@/components/core/chat/ChatAgentHelper').default;
  let useChatStore: typeof import('@/web/core/chat/context/useChatStore').useChatStore;
  let helperRef: React.RefObject<ChatAgentHelperRefType>;
  const cacheKey = 'app-1';
  const builderCacheKey = 'app-2';
  const render = async () => {
    await act(async () => {
      root.render(
        React.createElement(ChatAgentHelper, {
          ChatBoxRef: helperRef,
          appId: 'app-1',
          type: ChatAgentHelperTypeEnum.chatAgent,
          metadata: {},
          onApply: vi.fn()
        })
      );
    });
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    mocks.getInitChatInfo.mockResolvedValue({});
    mocks.getChatHistories.mockResolvedValue({ list: [{ chatId: 'server-chat' }], total: 1 });
    dom = new JSDOM('<div id="root"></div>', { url: 'https://fastgpt.example.com' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('localStorage', dom.window.localStorage);
    vi.stubGlobal('sessionStorage', dom.window.sessionStorage);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    ({ useChatStore } = await import('@/web/core/chat/context/useChatStore'));
    const { useUserStore } = await import('@/web/support/user/useUserStore');
    ({ default: ChatAgentHelper } = await import('@/components/core/chat/ChatAgentHelper'));
    useUserStore.setState({ userInfo: { team: { tmbId: 'member-1' } } as UserType });
    useChatStore.setState({
      loaded: true,
      appBuilderChatIdMap: { [cacheKey]: 'saved-chat', [builderCacheKey]: 'builder-chat' }
    });
    helperRef = createRef();
    root = createRoot(document.getElementById('root')!);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('switches only the helper chatId without deleting history and keeps it after reopening', async () => {
    await render();
    expect(document.querySelector('[data-chat-id]')?.getAttribute('data-chat-id')).toBe(
      'saved-chat'
    );

    await act(async () => helperRef.current!.restartChat());
    const newChatId = useChatStore.getState().appBuilderChatIdMap[cacheKey];
    expect(newChatId).toHaveLength(24);
    expect(newChatId).not.toBe('saved-chat');
    expect(mocks.batchDeleteChatHistories).not.toHaveBeenCalled();
    expect(mocks.clearChatRecords).toHaveBeenCalledOnce();
    expect(useChatStore.getState().appBuilderChatIdMap[builderCacheKey]).toBe('builder-chat');
    expect(document.querySelector('[data-chat-id]')?.getAttribute('data-chat-id')).toBe(newChatId);

    await act(async () => root.unmount());
    root = createRoot(document.getElementById('root')!);
    await render();
    expect(document.querySelector('[data-chat-id]')?.getAttribute('data-chat-id')).toBe(newChatId);
    expect(mocks.getChatHistories).not.toHaveBeenCalled();
  });

  it('restores the server conversation after login clears the app cache', async () => {
    useChatStore.getState().resetChatCache();
    await render();

    expect(mocks.getChatHistories).toHaveBeenCalledExactlyOnceWith({
      appId: 'app-1',
      sourceType: 'chatAgentHelper',
      pageNum: 1,
      pageSize: 1
    });
    expect(useChatStore.getState().appBuilderChatIdMap).toEqual({ 'app-1': 'server-chat' });
    expect(document.querySelector('[data-chat-id]')?.getAttribute('data-chat-id')).toBe(
      'server-chat'
    );
  });

  it('creates a new conversation only when the server returns no history', async () => {
    useChatStore.getState().resetChatCache();
    mocks.getChatHistories.mockResolvedValueOnce({ list: [], total: 0 });
    await render();

    expect(useChatStore.getState().appBuilderChatIdMap['app-1']).toHaveLength(24);
    expect(mocks.batchDeleteChatHistories).not.toHaveBeenCalled();
  });

  it('does not create a new conversation on history failure and supports retry', async () => {
    useChatStore.getState().resetChatCache();
    mocks.getChatHistories.mockRejectedValueOnce(new Error('history unavailable'));
    await render();

    expect(useChatStore.getState().appBuilderChatIdMap).toEqual({});
    expect(document.body.textContent).toContain('load_failed');
    await act(async () => document.querySelector('button')!.click());
    expect(useChatStore.getState().appBuilderChatIdMap['app-1']).toBe('server-chat');
  });
  it.each(['restart', 'logout'] as const)('ignores late chat details after %s', async (action) => {
    let resolve!: (value: { chatId: string; title: string }) => void;
    mocks.getInitChatInfo.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      })
    );
    let chatBoxData: Record<string, unknown> = {};
    mocks.setChatBoxData.mockImplementation((update) => {
      chatBoxData = typeof update === 'function' ? update(chatBoxData) : update;
    });
    mocks.getChatHistories.mockResolvedValue({ list: [{ chatId: 'restored-chat' }], total: 1 });
    await render();
    if (action === 'restart') {
      await act(async () => helperRef.current!.restartChat());
    } else {
      // 模拟登录页清缓存和重新获取身份，组件需先恢复服务端历史再加载详情。
      await act(async () => useChatStore.getState().resetChatCache());
    }
    const newChatId = useChatStore.getState().appBuilderChatIdMap['app-1'];
    expect(chatBoxData.chatId).toBe(newChatId);
    await act(async () => resolve({ chatId: 'saved-chat', title: '旧会话标题' }));
    expect(chatBoxData.chatId).toBe(newChatId);
    expect(chatBoxData.title).not.toBe('旧会话标题');
  });
});
