import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SharePage from '@/pages/chat/share';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { createJSONStorage } from '@fastgpt/web/common/zustand';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import type { InitOutLinkChatResponseType } from '@fastgpt/global/openapi/core/chat/outLink/api';

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  stream: vi.fn(),
  box: vi.fn(),
  isPc: true,
  query: { shareId: 'share-a' },
  chat: {
    histories: [],
    forbidLoadChat: { current: false },
    onChangeChatId: vi.fn(),
    onOpenSlider: vi.fn(),
    onCloseSlider: vi.fn()
  }
}));
vi.mock('@/web/core/chat/api', () => ({ getInitOutLinkChatInfo: mocks.init }));
vi.mock('@/web/common/api/fetch', () => ({ streamFetch: mocks.stream }));
vi.mock('next/router', () => ({ useRouter: () => ({ query: mocks.query }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/hooks/useSystem', () => ({
  useSystem: () => ({ isPc: mocks.isPc })
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/web/core/chat/storeShareChat', () => ({
  useShareChatStore: () => ({ localUId: 'visitor', loaded: true })
}));
/* eslint-disable react/no-children-prop -- Context Provider 的 children 为必填，显式传入以满足类型约束。 */
vi.mock('@/web/core/chat/context/chatContext', async () => {
  const { createContext } = await import('use-context-selector');
  const ChatContext = createContext(mocks.chat);
  return {
    ChatContext,
    default: ({ children }: { children: React.ReactNode }) =>
      React.createElement(ChatContext.Provider, { value: mocks.chat, children })
  };
});
vi.mock('@/web/core/chat/context/chatItemContext', async () => {
  const { createContext } = await import('use-context-selector');
  const ChatItemContext = createContext<any>({});
  return {
    ChatItemContext,
    default: ({ children }: { children: React.ReactNode }) => {
      const [chatBoxData, setChatBoxData] = React.useState({
        app: { name: 'Shared app', chatConfig: {} }
      });
      const value = React.useMemo(
        () => ({
          chatBoxData,
          setChatBoxData,
          resetVariables: () => {},
          isPlugin: false
        }),
        [chatBoxData]
      );
      return React.createElement(ChatItemContext.Provider, { value, children });
    }
  };
});
vi.mock('@/web/core/chat/context/chatRecordContext', async () => {
  const { createContext } = await import('use-context-selector');
  const value = { chatRecords: [], isChatRecordsLoaded: true };
  const ChatRecordContext = createContext(value);
  return {
    ChatRecordContext,
    default: ({ children }: { children: React.ReactNode }) =>
      React.createElement(ChatRecordContext.Provider, { value, children })
  };
});
/* eslint-enable react/no-children-prop */
vi.mock('@/components/core/chat/ChatContainer/ChatBox', () => ({ default: mocks.box }));
vi.mock('@/pageComponents/chat/ChatWindow/ChatWindowHeader', () => ({
  default: ({ endActions }: { endActions: React.ReactNode }) => endActions
}));
vi.mock('@/pageComponents/chat/ShareBrand', () => ({
  default: ({ narrow, onDismiss }: { narrow: boolean; onDismiss: () => void }) =>
    React.createElement(
      'button',
      { 'data-share-brand': narrow ? 'narrow' : 'wide', onClick: onDismiss },
      'FastGPT'
    )
}));
vi.mock('@/components/common/ComplianceTip', () => ({
  default: () => React.createElement('div', { 'data-compliance-tip': true })
}));
vi.mock('@chakra-ui/react', () => {
  const Container = ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', {}, children);
  return { Box: Container, Flex: Container, IconButton: () => null };
});
vi.mock('@/components/PageContainer', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@/components/SideBar', () => ({ default: () => null }));
vi.mock('@/components/common/NextHead', () => ({ default: () => null }));
vi.mock('@/pageComponents/chat/slider/ChatSliderSidebar', () => ({ default: () => null }));
vi.mock('@/pageComponents/chat/slider/ChatSliderMobileDrawer', () => ({
  default: () => null
}));
vi.mock('@/pageComponents/chat/LanguageSelector', () => ({ default: () => null }));
vi.mock('@/pageComponents/chat/ToolMenu', () => ({ default: () => null }));
vi.mock('@/pageComponents/chat/ChatQuoteList', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@/pageComponents/chat/SandboxEditor/hook', () => ({
  useSandboxStatus: () => ({ SandboxEntryIcon: () => null }),
  useSandboxEditor: () => ({ SandboxEditorModal: () => null, onOpenSandboxModal: () => {} })
}));
vi.mock('@/pageComponents/chat/ChatWindow/useAppChatGenerateStatusSync', () => ({
  useAppChatGenerateStatusSync: () => () => {}
}));
vi.mock('@/web/core/chat/history/api', () => ({ postMarkChatRead: vi.fn() }));
vi.mock('@/web/common/i18n/utils', () => ({ serviceSideProps: vi.fn() }));

const originalChat = useChatStore.getState();
const originalStorage = useChatStore.persist.getOptions().storage;
const props: React.ComponentProps<typeof SharePage> = {
  appId: 'app',
  shareId: 'share-a',
  customUid: '',
  authToken: '',
  appName: 'Shared app',
  appIntro: '',
  appAvatar: '',
  canDownloadSource: false,
  isShowCite: false,
  isShowFullText: false,
  showRunningStatus: false,
  showSkillReferences: false
};
const initResult = (showBrand = true) =>
  ({
    app: { name: 'Shared app', chatConfig: {} },
    variables: {},
    branding: { enabled: true, showBrand }
  }) as InitOutLinkChatResponseType;

describe('share page branding across chat initialization', () => {
  let dom: JSDOM;
  let root: Root;
  let container: HTMLElement;
  const render = async (overrides: Partial<typeof props> = {}) => {
    const pageProps = { ...props, ...overrides };
    mocks.query = { shareId: pageProps.shareId };
    await act(async () => root.render(React.createElement(SharePage, pageProps)));
  };
  const brand = () => container.querySelector('[data-share-brand]');
  const placement = () => mocks.box.mock.lastCall![0].complianceTipPlacement;
  const finishFirstMessage = async () => {
    const onStart = mocks.box.mock.lastCall![0].onStartChat as (
      input: StartChatFnProps
    ) => Promise<unknown>;
    await act(async () => {
      await onStart({
        messages: [],
        variables: {},
        controller: new AbortController(),
        responseChatItemId: 'answer',
        generatingMessage: () => {}
      });
    });
  };

  beforeEach(() => {
    dom = new JSDOM('<div id="root"></div>', { url: 'https://chat.example.com' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('top', dom.window);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('React', React);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.clearAllMocks();
    mocks.isPc = true;
    mocks.chat.forbidLoadChat.current = false;
    mocks.box.mockReturnValue(null);
    mocks.init.mockReset().mockResolvedValue(initResult());
    mocks.stream.mockReset().mockResolvedValue({ responseText: 'answer' });
    mocks.chat.onChangeChatId.mockImplementation((chatId: string, forbid: boolean) => {
      mocks.chat.forbidLoadChat.current = forbid;
      useChatStore.getState().setChatId(chatId);
    });
    useChatStore.persist.setOptions({
      storage: createJSONStorage(() => dom.window.sessionStorage)
    });
    useChatStore.setState({
      loaded: true,
      source: 'share',
      appId: 'app',
      chatId: '',
      appChatIdMap: {},
      outLinkAuthData: undefined
    });
    container = document.getElementById('root')!;
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    useChatStore.setState(originalChat);
    useChatStore.persist.setOptions({ storage: originalStorage });
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it.each([true, false])(
    'preserves branding after the first message skips initialization (desktop: %s)',
    async (isPc) => {
      mocks.isPc = isPc;
      await render();
      expect(brand()?.getAttribute('data-share-brand')).toBe(isPc ? 'wide' : 'narrow');
      expect(placement()).toBe(isPc ? 'default' : 'external');
      expect(mocks.init).toHaveBeenCalledOnce();

      // 身份绑定会预分配 chatId；这里模拟尚未持久化会话 ID 的首条消息路径。
      await act(async () => useChatStore.setState({ chatId: '' }));
      const initCalls = mocks.init.mock.calls.length;
      await finishFirstMessage();
      expect(mocks.chat.onChangeChatId).toHaveBeenCalledWith(expect.any(String), true);
      expect(useChatStore.getState().chatId).not.toBe('');
      expect(mocks.chat.forbidLoadChat.current).toBe(false);
      expect(mocks.box.mock.lastCall![0].isReady).toBe(true);
      expect(mocks.init).toHaveBeenCalledTimes(initCalls);
      expect(brand()?.getAttribute('data-share-brand')).toBe(isPc ? 'wide' : 'narrow');
      expect(placement()).toBe(isPc ? 'default' : 'external');
      expect(container.querySelector('[data-compliance-tip]') !== null).toBe(!isPc);

      await act(async () => (brand() as HTMLButtonElement).click());
      expect(brand()).toBeNull();
      expect(placement()).toBe('default');
      await act(async () => useChatStore.getState().setChatId('another-chat'));
      expect(brand()).toBeNull();
    }
  );

  it('applies a later initialization that disables branding', async () => {
    await render();
    expect(brand()).not.toBeNull();
    mocks.init.mockResolvedValueOnce(initResult(false));
    await act(async () => useChatStore.getState().setChatId('history-chat'));
    expect(mocks.init).toHaveBeenCalledTimes(2);
    expect(brand()).toBeNull();
  });

  it.each([{ shareId: 'share-b' }, { customUid: 'another-visitor' }])(
    'does not reuse branding when the share identity changes: %j',
    async (identity) => {
      await render();
      expect(brand()).not.toBeNull();
      const next = Promise.withResolvers<InitOutLinkChatResponseType>();
      mocks.init.mockReturnValue(next.promise);
      await render(identity);
      expect(brand()).toBeNull();
      await act(async () => next.resolve(initResult(false)));
      expect(brand()).toBeNull();
    }
  );

  it('ignores an old identity response after a new link has initialized', async () => {
    const previous = Promise.withResolvers<InitOutLinkChatResponseType>();
    mocks.init.mockImplementation(({ outLinkAuthData }) =>
      outLinkAuthData.shareId === 'share-a' ? previous.promise : Promise.resolve(initResult(false))
    );
    await render();
    await render({ shareId: 'share-b' });
    expect(brand()).toBeNull();
    await act(async () => previous.resolve(initResult()));
    expect(brand()).toBeNull();
  });
});
