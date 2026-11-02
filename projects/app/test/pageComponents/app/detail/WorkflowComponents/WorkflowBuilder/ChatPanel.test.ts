import React, { act, createRef, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppDetailType } from '@fastgpt/global/core/app/type';
import { ChatRoleEnum, ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatSiteItemType } from '@/components/core/chat/ChatContainer/ChatBox/type';
import type { WorkflowBuilderVersion } from '@fastgpt/global/core/workflow/builder/type';
import type { UserType } from '@fastgpt/global/support/user/type';
import type { WorkflowBuilderChatPanelRef } from '@/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/ChatPanel';

const mocks = vi.hoisted(() => ({
  router: {
    isReady: true,
    pathname: '/app/detail',
    query: {} as Record<string, string>,
    replace: vi.fn()
  },
  getChatHistories: vi.fn(),
  batchDeleteChatHistories: vi.fn(),
  getInitChatInfo: vi.fn(),
  clearChatRecords: vi.fn(),
  setChatBoxData: vi.fn(),
  onChatIdChange: vi.fn(),
  onActivityChange: vi.fn(),
  toast: vi.fn(),
  records: [] as ChatSiteItemType[],
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
vi.mock('@fastgpt/web/components/common/Icon', () => ({
  default: ({ name, color }: { name: string; color: string }) =>
    React.createElement('svg', { 'data-icon': name, 'data-color': color })
}));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@/components/core/chat/ChatContainer/ChatBox/components/LikeFeedbackButton', () => ({
  default: () => null
}));
vi.mock('@/components/core/chat/ChatContainer/context/chatFeedbackContext', async () => {
  const { createContext } = await import('use-context-selector');
  return { ChatFeedbackContext: createContext(undefined) };
});
vi.mock('@/components/core/chat/ChatContainer/ChatBox', async () => {
  const { useContextSelector } = await import('use-context-selector');
  const { ChatRecordContext } = await import('@/web/core/chat/context/chatRecordContext');
  const { default: VersionCard } =
    await import('@/components/core/chat/components/AIResponseBox/WorkflowBuilder/RenderWorkflowBuilderVersion');
  return {
    default: ({ chatId }: { chatId: string }) => {
      const records = useContextSelector(ChatRecordContext, (value) => value.chatRecords);
      return React.createElement(
        'div',
        { 'data-chat-id': chatId },
        records
          .filter((record) => record.obj === ChatRoleEnum.AI)
          .flatMap((record) =>
            record.value.map(
              (item, index) =>
                item.workflowBuilderVersion &&
                React.createElement(VersionCard, {
                  key: `${record.dataId}:${index}`,
                  version: item.workflowBuilderVersion,
                  responseChatItemId: record.dataId
                })
            )
          )
      );
    }
  };
});
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
  const ChatRecordContext = createContext({
    chatRecords: [] as ChatSiteItemType[],
    isChatRecordsLoaded: true,
    setChatRecords: (() => {}) as React.Dispatch<React.SetStateAction<ChatSiteItemType[]>>
  });
  return {
    default: ({ params, children }: { params: { chatId: string }; children: React.ReactNode }) => {
      const [chatRecords, setChatRecords] = React.useState(mocks.records);
      return React.createElement(
        'div',
        { 'data-record-chat-id': params.chatId },
        React.createElement(
          ChatRecordContext.Provider,
          {
            value: { chatRecords, setChatRecords, isChatRecordsLoaded: true }
          },
          children
        )
      );
    },
    ChatRecordContext
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
  const cacheKey = (appId = 'app-1') => appId;
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
  const selectedChatId = () => useChatStore.getState().appBuilderChatIdMap[cacheKey()];

  beforeEach(async () => {
    vi.resetAllMocks();
    mocks.records = [];
    mocks.router.isReady = true;
    mocks.router.query = {};
    mocks.router.replace.mockResolvedValue(true);
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
    useChatStore.setState({ loaded: true, appBuilderChatIdMap: {} });
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

  it('updates the version card and activity together without marking other messages or sessions', async () => {
    const version: WorkflowBuilderVersion = {
      versionNo: 1,
      name: 'AI 生成版本 1',
      filename: 'version-1.json',
      checksum: `sha256:${'1'.repeat(64)}`,
      generatedAt: '2026-10-19T00:00:00.000Z',
      expiresAt: '2099-10-20T00:00:00.000Z'
    };
    const appliedVersion = { ...version, appliedAt: '2026-10-19T01:00:00.000Z' };
    // 相同 checksum 可以出现在不同消息；只有指定 AI 消息的版本应被标记。
    mocks.records = [ChatRoleEnum.Human, ChatRoleEnum.AI, ChatRoleEnum.AI].map((obj, index) => ({
      id: `record-${index}`,
      dataId: index === 0 ? 'response-1' : `response-${index}`,
      obj,
      status: ChatStatusEnum.finish,
      value: [{ workflowBuilderVersion: version }]
    }));
    await render();
    const update = {
      appId: 'app-1',
      chatId: 'saved-chat',
      responseChatItemId: 'response-2',
      version: appliedVersion
    };
    await act(async () => {
      panelRef.current!.updateAppliedVersion({ ...update, appId: 'other-app' });
      panelRef.current!.updateAppliedVersion({ ...update, chatId: 'old-chat' });
      panelRef.current!.updateAppliedVersion({
        ...update,
        version: { ...appliedVersion, checksum: 'other-version' }
      });
    });
    expect(document.body.textContent).not.toContain('workflow_builder_version_applied');

    await act(async () => panelRef.current!.updateAppliedVersion(update));
    expect(document.body.textContent?.match(/workflow_builder_version_applied/g)).toHaveLength(1);
    expect(document.querySelectorAll('[data-color="myGray.600"]')).toHaveLength(1);
    expect(mocks.onActivityChange.mock.lastCall![0].latestVersion).toEqual({
      version: appliedVersion,
      responseChatItemId: 'response-2'
    });

    // 新会话即使保留相同消息窗口，也不能接收旧会话的应用回写。
    await act(async () => panelRef.current!.restartChat());
    await act(async () =>
      panelRef.current!.updateAppliedVersion({
        ...update,
        responseChatItemId: 'response-1'
      })
    );
    expect(document.body.textContent?.match(/workflow_builder_version_applied/g)).toHaveLength(1);
  });

  it('restores server history after login clears the local session index before mounting the chat', async () => {
    useChatStore.getState().setAppBuilderChatId(cacheKey(), 'saved-chat');
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
    useChatStore.getState().setAppBuilderChatId(cacheKey(), 'local-chat');
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
    useChatStore.getState().setAppBuilderChatId(cacheKey(), 'own-chat');
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
    expect(useChatStore.getState().appBuilderChatIdMap).toEqual({});
    expect(document.body.textContent).not.toContain('load_failed');

    await act(async () => currentRequest.resolve(history('current-chat')));
    const currentKey = context === 'app' ? cacheKey('app-2') : cacheKey();
    expect(useChatStore.getState().appBuilderChatIdMap).toEqual({ [currentKey]: 'current-chat' });
  });

  it('keeps a conversation selected from another tab while the history request is pending', async () => {
    const request = deferred<ReturnType<typeof history>>();
    mocks.getChatHistories.mockReturnValueOnce(request.promise);
    await render();
    await act(async () =>
      useChatStore.getState().setAppBuilderChatId(cacheKey(), 'other-tab-chat')
    );
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

  it('starts and preserves a new conversation without deleting or restoring the previous history', async () => {
    await render();
    await act(async () => panelRef.current!.restartChat());
    expect(mocks.batchDeleteChatHistories).not.toHaveBeenCalled();
    expect(mocks.clearChatRecords).toHaveBeenCalledOnce();
    const newChatId = selectedChatId();
    expect(newChatId).toHaveLength(24);
    expect(newChatId).not.toBe('saved-chat');
    expect(mocks.onChatIdChange).toHaveBeenLastCalledWith(newChatId);

    await act(async () => root.unmount());
    root = createRoot(document.getElementById('root')!);
    await render();
    expect(selectedChatId()).toBe(newChatId);
    expect(mocks.onChatIdChange).toHaveBeenLastCalledWith(newChatId);
    expect(mocks.getChatHistories).toHaveBeenCalledOnce();
  });

  it('leaves the watch link when starting the member’s own new conversation', async () => {
    mocks.router.query = { appId: 'app-1', workflowBuilderChatId: 'watched-chat' };
    useChatStore.getState().setAppBuilderChatId(cacheKey(), 'own-chat');
    await render();

    await act(async () => panelRef.current!.restartChat());
    const newChatId = selectedChatId();
    expect(newChatId).toHaveLength(24);
    expect(newChatId).not.toBe('own-chat');
    expect(newChatId).not.toBe('watched-chat');
    expect(mocks.batchDeleteChatHistories).not.toHaveBeenCalled();
    expect(mocks.router.replace).toHaveBeenCalledExactlyOnceWith(
      { pathname: '/app/detail', query: { appId: 'app-1' } },
      undefined,
      { shallow: true }
    );

    mocks.router.query = { appId: 'app-1' };
    await render();
    expect(mocks.onChatIdChange).toHaveBeenLastCalledWith(newChatId);
    expect(mocks.getChatHistories).not.toHaveBeenCalled();
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
    useChatStore.getState().setAppBuilderChatId('app-1', 'saved-chat');
    mocks.getChatHistories.mockResolvedValue({ list: [{ chatId: 'restored-chat' }], total: 1 });
    await render();
    if (action === 'restart') {
      await act(async () => panelRef.current!.restartChat());
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
