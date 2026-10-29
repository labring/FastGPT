import React, { act, createRef, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppDetailType } from '@fastgpt/global/core/app/type';
import type { UserType } from '@fastgpt/global/support/user/type';
import type { WorkflowBuilderChatPanelRef } from '@/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/ChatPanel';

const mocks = vi.hoisted(() => ({
  router: { isReady: true, query: {} as Record<string, string> },
  getChatHistories: vi.fn(),
  batchDeleteChatHistories: vi.fn(),
  getInitChatInfo: vi.fn(),
  clearChatRecords: vi.fn(),
  setChatBoxData: vi.fn(),
  onChatIdChange: vi.fn(),
  onActivityChange: vi.fn(),
  toast: vi.fn(),
  t: (key: string) => key
}));

vi.mock('next/router', () => ({ useRouter: () => mocks.router }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: mocks.t }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/web/core/chat/history/api', () => ({
  getChatHistories: mocks.getChatHistories,
  batchDeleteChatHistories: mocks.batchDeleteChatHistories
}));
vi.mock('@/web/core/chat/api', () => ({ getInitChatInfo: mocks.getInitChatInfo }));
vi.mock('@/web/core/ai/model/useModelDefault', () => ({
  useModelDefault: () => ({ model: undefined })
}));
vi.mock('@/web/core/ai/model/useModelDetail', () => ({
  useModelDetail: () => ({ model: { modelId: 'model-1' } })
}));
vi.mock('@/pageComponents/chat/ChatWindow/ChatAIModelSelector', () => ({ default: () => null }));
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
      chatBoxData: {},
      setChatBoxData: mocks.setChatBoxData,
      clearChatRecords: mocks.clearChatRecords
    })
  };
});
vi.mock('@/web/core/chat/context/chatRecordContext', async () => {
  const { createContext } = await import('use-context-selector');
  return {
    default: ({ params, children }: { params: { chatId: string }; children: React.ReactNode }) =>
      React.createElement('div', { 'data-record-chat-id': params.chatId }, children),
    ChatRecordContext: createContext({ chatRecords: [], isChatRecordsLoaded: true })
  };
});
vi.mock('@/pageComponents/app/detail/WorkflowComponents/context/workflowInitContext', async () => {
  const { createContext } = await import('use-context-selector');
  return { WorkflowBufferDataContext: createContext({ getNodes: () => [], edges: [] }) };
});
vi.mock('@/pageComponents/app/detail/WorkflowComponents/adapters/document', () => ({
  appDetailToWorkflowDocumentApp: vi.fn(),
  reactFlowStateToWorkflowDocument: vi.fn()
}));
vi.mock('@chakra-ui/react', () => {
  const Container = ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children);
  return {
    Box: Container,
    Flex: Container,
    Text: Container,
    Spinner: () => React.createElement('div', { role: 'status' }),
    Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) =>
      React.createElement('button', { onClick }, children)
  };
});

/** 控制历史请求的完成顺序，验证身份和会话选择变化后迟到的响应不会写回。 */
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};

describe('WorkflowBuilder ChatPanel session recovery', () => {
  let dom: JSDOM;
  let root: Root;
  let mounted: boolean;
  let ChatPanel: typeof import('@/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/ChatPanel').default;
  let useChatStore: typeof import('@/web/core/chat/context/useChatStore').useChatStore;
  let useUserStore: typeof import('@/web/support/user/useUserStore').useUserStore;
  let panelRef: React.RefObject<WorkflowBuilderChatPanelRef>;
  const cacheKey = (appId = 'app-1', tmbId = 'member-1') =>
    `workflow-builder:workflowBuilder:${appId}:${tmbId}`;
  const history = (chatId = 'saved-chat') => ({ list: [{ chatId }], total: 1 });
  const setMember = (tmbId: string) => {
    useUserStore.setState({ userInfo: { team: { tmbId } } as UserType });
  };
  const render = async (props: Partial<ComponentProps<typeof ChatPanel>> = {}) => {
    await act(async () => {
      root.render(
        React.createElement(ChatPanel, {
          appId: 'app-1',
          appDetail: { name: 'Workflow', avatar: '', chatConfig: {} } as AppDetailType,
          workflowBuilderVersionActions: {
            isApplying: false,
            applyVersion: vi.fn(),
            notifyVersionExpired: vi.fn()
          },
          onChatIdChange: mocks.onChatIdChange,
          onActivityChange: mocks.onActivityChange,
          focusRequestId: 0,
          ...props,
          ref: panelRef
        })
      );
    });
  };
  const selectedChatId = () => useChatStore.getState().sourceChatIdMap[cacheKey()];

  beforeEach(async () => {
    vi.resetAllMocks();
    mocks.router.isReady = true;
    mocks.router.query = {};
    mocks.getChatHistories.mockResolvedValue(history());
    mocks.getInitChatInfo.mockResolvedValue({});
    mocks.batchDeleteChatHistories.mockResolvedValue(undefined);
    dom = new JSDOM('<div id="root"></div>', { url: 'https://fastgpt.example.com' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('localStorage', dom.window.localStorage);
    vi.stubGlobal('sessionStorage', dom.window.sessionStorage);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    ({ useChatStore } = await import('@/web/core/chat/context/useChatStore'));
    ({ useUserStore } = await import('@/web/support/user/useUserStore'));
    ({ default: ChatPanel } =
      await import('@/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/ChatPanel'));
    useChatStore.setState({ loaded: true, sourceChatIdMap: {} });
    setMember('member-1');
    panelRef = createRef();
    root = createRoot(document.getElementById('root')!);
    mounted = true;
  });

  afterEach(async () => {
    if (mounted) await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('restores server history after login clears the local session index before mounting the chat', async () => {
    useChatStore.getState().setSourceChatId(cacheKey(), 'saved-chat');
    useChatStore.getState().resetChatCache();
    const request = deferred<ReturnType<typeof history>>();
    mocks.getChatHistories.mockReturnValueOnce(request.promise);

    await render();
    expect(selectedChatId()).toBeUndefined();
    expect(document.querySelector('[data-chat-id]')).toBeNull();
    expect(document.querySelector('[role="status"]')).not.toBeNull();
    expect(mocks.getChatHistories).toHaveBeenCalledExactlyOnceWith({
      appId: 'app-1',
      sourceType: 'workflowBuilder',
      pageNum: 1,
      pageSize: 1
    });

    await act(async () => request.resolve(history()));
    expect(selectedChatId()).toBe('saved-chat');
    expect(
      document.querySelector('[data-record-chat-id]')?.getAttribute('data-record-chat-id')
    ).toBe('saved-chat');
    expect(document.querySelector('[data-chat-id]')?.getAttribute('data-chat-id')).toBe(
      'saved-chat'
    );
    expect(mocks.onChatIdChange).toHaveBeenLastCalledWith('saved-chat');
  });

  it('keeps the locally selected conversation without querying server history', async () => {
    useChatStore.getState().setSourceChatId(cacheKey(), 'local-chat');
    await render();
    expect(mocks.getChatHistories).not.toHaveBeenCalled();
    expect(mocks.onChatIdChange).toHaveBeenLastCalledWith('local-chat');
  });

  it('creates a new conversation only after the server confirms there is no history', async () => {
    mocks.getChatHistories.mockResolvedValueOnce({ list: [], total: 0 });
    await render();
    expect(selectedChatId()).toHaveLength(24);
    expect(mocks.onChatIdChange).toHaveBeenLastCalledWith(selectedChatId());
  });

  it('keeps the session empty when history loading fails and restores it through the refresh action', async () => {
    mocks.getChatHistories.mockRejectedValueOnce(new Error('history unavailable'));
    await render();
    expect(selectedChatId()).toBeUndefined();
    expect(document.querySelector('[data-chat-id]')).toBeNull();
    expect(document.body.textContent).toContain('load_failed');

    await act(async () => document.querySelector('button')!.click());
    expect(mocks.getChatHistories).toHaveBeenCalledTimes(2);
    expect(selectedChatId()).toBe('saved-chat');
    expect(document.body.textContent).not.toContain('load_failed');
  });

  it.each(['route', 'storage', 'member'] as const)(
    'waits for the %s to be ready before restoring history',
    async (dependency) => {
      if (dependency === 'route') mocks.router.isReady = false;
      if (dependency === 'storage') useChatStore.setState({ loaded: false });
      if (dependency === 'member') setMember('');
      await render();
      expect(mocks.getChatHistories).not.toHaveBeenCalled();
      expect(selectedChatId()).toBeUndefined();

      await act(async () => {
        mocks.router.isReady = true;
        useChatStore.setState({ loaded: true });
        setMember('member-1');
      });
      await render();
      expect(selectedChatId()).toBe('saved-chat');
    }
  );

  it('opens a watch link without querying history or replacing the member’s own conversation', async () => {
    mocks.router.query.workflowBuilderChatId = 'watched-chat';
    useChatStore.getState().setSourceChatId(cacheKey(), 'own-chat');
    await render();
    expect(mocks.getChatHistories).not.toHaveBeenCalled();
    expect(selectedChatId()).toBe('own-chat');
    expect(mocks.onChatIdChange).toHaveBeenLastCalledWith('watched-chat');
  });

  it.each([
    ['app', 'success'],
    ['app', 'failure'],
    ['member', 'success'],
    ['member', 'failure']
  ] as const)('ignores an old %s request %s after switching context', async (context, outcome) => {
    const oldRequest = deferred<ReturnType<typeof history>>();
    const currentRequest = deferred<ReturnType<typeof history>>();
    mocks.getChatHistories
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(currentRequest.promise);
    await render();

    if (context === 'member') await act(async () => setMember('member-2'));
    else await render({ appId: 'app-2' });
    await act(async () => {
      if (outcome === 'success') oldRequest.resolve(history('old-chat'));
      else oldRequest.reject(new Error('old request failed'));
    });
    expect(useChatStore.getState().sourceChatIdMap).toEqual({});
    expect(document.body.textContent).not.toContain('load_failed');

    await act(async () => currentRequest.resolve(history('current-chat')));
    const currentKey = context === 'app' ? cacheKey('app-2') : cacheKey('app-1', 'member-2');
    expect(useChatStore.getState().sourceChatIdMap).toEqual({ [currentKey]: 'current-chat' });
  });

  it('keeps a conversation selected from another tab while the history request is pending', async () => {
    const request = deferred<ReturnType<typeof history>>();
    mocks.getChatHistories.mockReturnValueOnce(request.promise);
    await render();
    await act(async () => useChatStore.getState().setSourceChatId(cacheKey(), 'other-tab-chat'));
    await act(async () => request.resolve(history()));
    expect(selectedChatId()).toBe('other-tab-chat');
  });

  it('does not restore a pending session after unmounting', async () => {
    const request = deferred<ReturnType<typeof history>>();
    mocks.getChatHistories.mockReturnValueOnce(request.promise);
    await render();
    await act(async () => root.unmount());
    mounted = false;
    await act(async () => request.resolve(history()));
    expect(selectedChatId()).toBeUndefined();
  });

  it('starts a new conversation after explicitly clearing history without restoring the deleted one', async () => {
    await render();
    await act(async () => panelRef.current!.clearHistory());
    expect(mocks.batchDeleteChatHistories).toHaveBeenCalledExactlyOnceWith({
      appId: 'app-1',
      sourceType: 'workflowBuilder',
      chatIds: ['saved-chat']
    });
    expect(mocks.clearChatRecords).toHaveBeenCalledOnce();
    expect(selectedChatId()).toHaveLength(24);
    expect(selectedChatId()).not.toBe('saved-chat');
    expect(mocks.getChatHistories).toHaveBeenCalledOnce();
  });
});
