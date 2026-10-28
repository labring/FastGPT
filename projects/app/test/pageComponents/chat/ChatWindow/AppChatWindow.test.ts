import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppChatWindow from '@/pageComponents/chat/ChatWindow/AppChatWindow';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { ChatPageContext } from '@/web/core/chat/context/chatPageContext';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { createJSONStorage } from '@fastgpt/web/common/zustand';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';

const mocks = vi.hoisted(() => ({
  box: vi.fn(),
  init: vi.fn(),
  stream: vi.fn(),
  refreshRecent: vi.fn()
}));
vi.mock('@/components/core/chat/ChatContainer/ChatBox', () => ({ default: mocks.box }));
vi.mock('@/web/common/api/fetch', () => ({ streamFetch: mocks.stream }));
vi.mock('@/web/core/chat/api', () => ({ getInitChatInfo: mocks.init }));
vi.mock('@fastgpt/web/hooks/useSystem', () => ({ useSystem: () => ({ isPc: true }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/SideBar', () => ({ default: () => null }));
vi.mock('@/components/common/NextHead', () => ({ default: () => null }));
vi.mock('@/pageComponents/chat/slider/ChatSliderSidebar', () => ({
  default: () => null,
  CHAT_HISTORY_SLIDER_PC_WIDTH: '300px'
}));
vi.mock('@/pageComponents/chat/slider/ChatSliderMobileDrawer', () => ({ default: () => null }));
vi.mock('@/pageComponents/chat/ChatWindow/ChatWindowHeader', () => ({ default: () => null }));
vi.mock('@/pageComponents/chat/ToolMenu', () => ({ default: () => null }));
vi.mock('@/pageComponents/chat/SandboxEditor/hook', () => ({
  useSandboxStatus: () => ({ SandboxEntryIcon: () => null }),
  useSandboxEditor: () => ({ SandboxEditorModal: () => null, onOpenSandboxModal: () => {} })
}));
vi.mock('@/pageComponents/chat/ChatWindow/useAppChatGenerateStatusSync', () => ({
  useAppChatGenerateStatusSync: () => () => {}
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));

const originalChat = useChatStore.getState();
const originalStorage = useChatStore.persist?.getOptions().storage;

describe('AppChatWindow recently used refresh timing', () => {
  let dom: JSDOM;
  let root: Root;

  const render = async () => {
    const chat = { forbidLoadChat: { current: false }, histories: [], onChangeChatId: () => {} };
    const item = {
      chatBoxData: { appId: 'A', chatId: 'chat', app: { name: 'A' } },
      setChatBoxData: () => {},
      resetVariables: () => {}
    };
    /* eslint-disable react/no-children-prop -- Provider 的 children 为必填，显式传入以满足类型约束。 */
    await act(async () =>
      root.render(
        React.createElement(ChatPageContext.Provider, {
          value: { refreshRecentlyUsed: mocks.refreshRecent } as unknown as React.ComponentProps<
            typeof ChatPageContext.Provider
          >['value'],
          children: React.createElement(ChatContext.Provider, {
            value: chat as unknown as React.ComponentProps<typeof ChatContext.Provider>['value'],
            children: React.createElement(ChatItemContext.Provider, {
              value: item as unknown as React.ComponentProps<
                typeof ChatItemContext.Provider
              >['value'],
              children: React.createElement(ChatRecordContext.Provider, {
                value: { chatRecords: [] } as unknown as React.ComponentProps<
                  typeof ChatRecordContext.Provider
                >['value'],
                children: React.createElement(AppChatWindow)
              })
            })
          })
        })
      )
    );
    /* eslint-enable react/no-children-prop */
  };
  const startChat = (controller: AbortController) => {
    const onStart = mocks.box.mock.lastCall![0].onStartChat as (
      input: StartChatFnProps
    ) => Promise<{ responseText: string }>;
    return onStart({
      messages: [],
      variables: {},
      controller,
      responseChatItemId: 'response',
      generatingMessage: () => {}
    });
  };

  beforeEach(() => {
    dom = new JSDOM('<div id="root"></div>', { url: 'https://fastgpt.example' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    // Next 使用自动 JSX runtime；Vitest 的经典 JSX 转换需要真实 React 全局。
    vi.stubGlobal('React', React);
    vi.clearAllMocks();
    mocks.box.mockReturnValue(null);
    mocks.init.mockResolvedValue({ app: { name: 'A', chatConfig: {} }, variables: {} });
    useChatStore.persist?.setOptions({
      storage: createJSONStorage(() => dom.window.sessionStorage)
    });
    useChatStore.setState({ appId: 'A', chatId: 'chat', outLinkAuthData: undefined });
    root = createRoot(document.getElementById('root')!);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    useChatStore.setState(originalChat);
    useChatStore.persist?.setOptions({ storage: originalStorage });
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('does not refresh on initialization or send until the response finishes', async () => {
    const response = Promise.withResolvers<{ responseText: string }>();
    mocks.stream.mockReturnValueOnce(response.promise);
    await render();
    expect(mocks.init).toHaveBeenCalledOnce();
    expect(mocks.refreshRecent).not.toHaveBeenCalled();
    const request = startChat(new AbortController());
    expect(mocks.refreshRecent).not.toHaveBeenCalled();
    response.resolve({ responseText: 'answer' });
    await request;
    expect(mocks.refreshRecent).toHaveBeenCalledExactlyOnceWith('A');
  });

  it('does not refresh when leaving normally resolves the interrupted stream', async () => {
    await render();
    const controller = new AbortController();
    mocks.stream.mockImplementationOnce(async () => {
      controller.abort(new Error('leave'));
      return { responseText: 'partial answer' };
    });
    await startChat(controller);
    expect(mocks.refreshRecent).not.toHaveBeenCalled();
  });

  it('does not refresh when the request fails', async () => {
    await render();
    mocks.stream.mockRejectedValueOnce(new Error('offline'));
    await expect(startChat(new AbortController())).rejects.toThrow('offline');
    expect(mocks.refreshRecent).not.toHaveBeenCalled();
  });
});
