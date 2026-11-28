import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SharePage from '@/pages/chat/share';
import ChatSliderMobileDrawer from '@/pageComponents/chat/slider/ChatSliderMobileDrawer';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { createJSONStorage } from '@fastgpt/web/common/zustand';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { LangEnum, langMap } from '@fastgpt/global/common/i18n/type';
import { InitOutLinkChatResponseSchema } from '@fastgpt/global/openapi/core/chat/outLink/api';
import { SHARE_LANG_KEY } from '@fastgpt/web/i18n/utils';

type MockChatBoxData = {
  title?: string;
  app: { name: string; avatar?: string; chatConfig: Record<string, unknown> };
};

type MockChatItemContextValue = {
  chatBoxData: MockChatBoxData;
  setChatBoxData: React.Dispatch<React.SetStateAction<MockChatBoxData>>;
  resetVariables: () => void;
  clearChatRecords: () => void;
  setCiteModalData: (data: undefined) => void;
  isPlugin: boolean;
};

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  onChangeLng: vi.fn(),
  updateUserInfo: vi.fn(),
  isPc: true,
  isPlugin: false,
  isOpenSlider: true,
  query: { shareId: 'share-a' } as {
    shareId: string;
    showHistory?: string;
    showHead?: string;
    showWorkorder?: string;
  },
  chat: {
    histories: [],
    forbidLoadChat: { current: false },
    isOpenSlider: true,
    onChangeChatId: vi.fn(),
    onClearHistories: vi.fn(),
    onOpenSlider: vi.fn(),
    onCloseSlider: vi.fn()
  },
  chatItem: {
    clearChatRecords: vi.fn(),
    setCiteModalData: vi.fn()
  }
}));

vi.mock('@/web/core/chat/api', () => ({ getInitOutLinkChatInfo: mocks.init }));
vi.mock('@/web/common/api/fetch', () => ({ streamFetch: vi.fn() }));
vi.mock('next/router', () => ({ useRouter: () => ({ query: mocks.query }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'zh-CN' } })
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'zh-CN' } })
}));
vi.mock('@fastgpt/web/hooks/useSystem', () => ({ useSystem: () => ({ isPc: mocks.isPc }) }));
vi.mock('@fastgpt/web/hooks/useI18n', () => ({
  useI18nLng: () => ({ onChangeLng: mocks.onChangeLng })
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({
    userInfo: { username: 'signed-in-user' },
    updateUserInfo: mocks.updateUserInfo
  })
}));
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
      React.createElement(ChatContext.Provider, {
        value: { ...mocks.chat, isOpenSlider: mocks.isOpenSlider },
        children
      })
  };
});
vi.mock('@/web/core/chat/context/chatItemContext', async () => {
  const { createContext } = await import('use-context-selector');
  const defaultValue: MockChatItemContextValue = {
    chatBoxData: { app: { name: 'Shared app', chatConfig: {} } },
    setChatBoxData: () => {},
    resetVariables: () => {},
    clearChatRecords: mocks.chatItem.clearChatRecords,
    setCiteModalData: mocks.chatItem.setCiteModalData,
    isPlugin: false
  };
  const ChatItemContext = createContext<MockChatItemContextValue>(defaultValue);
  return {
    ChatItemContext,
    default: ({ children }: { children: React.ReactNode }) => {
      const [chatBoxData, setChatBoxData] = React.useState<MockChatBoxData>({
        app: { name: 'Shared app', chatConfig: {} }
      });
      const value = React.useMemo<MockChatItemContextValue>(
        () => ({
          chatBoxData,
          setChatBoxData,
          resetVariables: () => {},
          clearChatRecords: mocks.chatItem.clearChatRecords,
          setCiteModalData: mocks.chatItem.setCiteModalData,
          isPlugin: mocks.isPlugin
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
vi.mock('@/components/core/chat/ChatContainer/ChatBox', () => ({ default: () => null }));
vi.mock('@/pageComponents/chat/ChatWindow/ChatWindowHeader', () => ({
  default: ({ endActions }: { endActions: React.ReactNode }) =>
    React.createElement('header', { 'data-pc-header': 'true' }, endActions)
}));
vi.mock('@fastgpt/web/components/common/MyPopover', () => ({
  default: ({
    Trigger,
    placement,
    children
  }: {
    Trigger: React.ReactNode;
    placement?: string;
    children: (args: { onClose: () => void }) => React.ReactNode;
  }) => {
    const [open, setOpen] = React.useState(false);
    return React.createElement(
      'div',
      { 'data-popover-placement': placement ?? '' },
      React.createElement('div', { onClick: () => setOpen(true) }, Trigger),
      open ? children({ onClose: () => setOpen(false) }) : null
    );
  }
}));
vi.mock('@fastgpt/web/components/common/PhoneDrawer', () => ({
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? React.createElement('div', { 'data-phone-drawer': 'open' }, children) : null
}));
vi.mock('@fastgpt/web/components/common/MyBox', () => ({
  default: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', {}, children)
}));
vi.mock('@fastgpt/web/components/common/MyDivider', () => ({
  default: () => React.createElement('hr', { 'data-slider-divider': 'true' })
}));
vi.mock('@fastgpt/web/components/common/MyPopover/PopoverConfirm', () => ({
  default: ({ Trigger }: { Trigger: React.ReactNode }) => Trigger
}));
vi.mock('@/pageComponents/chat/ShareBrand', () => ({ default: () => null }));
vi.mock('@/components/common/ComplianceTip', () => ({ default: () => null }));
vi.mock('@chakra-ui/react', () => {
  const Container = ({
    children,
    as,
    pr,
    transform,
    onClick
  }: {
    children?: React.ReactNode;
    as?: string;
    pr?: string | number;
    transform?: string;
    onClick?: () => void;
  }) =>
    React.createElement(
      as ?? 'div',
      {
        ...(pr !== undefined ? { 'data-pr': String(pr) } : {}),
        ...(transform !== undefined ? { 'data-transform': transform } : {}),
        ...(onClick ? { onClick } : {})
      },
      children
    );
  return {
    Box: Container,
    Flex: Container,
    HStack: Container,
    Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) =>
      React.createElement('button', { type: 'button', onClick }, children),
    IconButton: ({
      'aria-label': ariaLabel,
      icon,
      onClick
    }: {
      'aria-label': string;
      icon?: React.ReactNode;
      onClick?: () => void;
    }) =>
      React.createElement(
        'button',
        { type: 'button', 'aria-label': ariaLabel, 'data-icon-button': 'true', onClick },
        icon
      ),
    MenuItem: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) =>
      React.createElement('button', { type: 'button', onClick }, children),
    Drawer: ({ isOpen, children }: { isOpen: boolean; children?: React.ReactNode }) =>
      isOpen ? React.createElement('aside', { 'data-mobile-drawer': 'open' }, children) : null,
    DrawerOverlay: () => null,
    DrawerContent: Container,
    Modal: () => null,
    ModalOverlay: () => null,
    ModalContent: Container,
    useTheme: () => ({ borders: { base: '1px solid #eee' } }),
    useDisclosure: () => {
      const [isOpen, setIsOpen] = React.useState(false);
      return {
        isOpen,
        onOpen: () => setIsOpen(true),
        onClose: () => setIsOpen(false)
      };
    }
  };
});
vi.mock('@/components/PageContainer', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@/components/SideBar', () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement('aside', { 'data-pc-sidebar': 'true' }, children)
}));
vi.mock('@/components/common/NextHead', () => ({ default: () => null }));
vi.mock('@/pageComponents/chat/slider/ChatSliderHeader', () => ({
  default: () => React.createElement('div', { 'data-slider-header': 'true' })
}));
vi.mock('@/pageComponents/chat/slider/ChatSliderList', () => ({
  default: () => React.createElement('div', { 'data-slider-list': 'true' })
}));
vi.mock('@/pageComponents/chat/slider/ChatSliderFooter', () => ({
  default: () => React.createElement('div', { 'data-slider-footer': 'true' })
}));
vi.mock('@/pageComponents/chat/ToolMenu', () => ({ default: () => null }));
vi.mock('@/pageComponents/chat/ChatQuoteList', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({
  default: ({ name }: { name: string }) => React.createElement('span', { 'data-icon': name })
}));
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

const APP_ID = '68ad85a7463006c963799a05';
const initResponseFixture = InitOutLinkChatResponseSchema.parse({
  appId: APP_ID,
  title: 'Shared chat',
  variables: {},
  app: {
    name: 'Shared app',
    intro: 'Shared intro',
    type: AppTypeEnum.simple,
    pluginInputs: [],
    chatConfig: {}
  },
  branding: {
    enabled: false,
    showBrand: false
  }
});

const originalChat = useChatStore.getState();
const originalStorage = useChatStore.persist.getOptions().storage;
const props: React.ComponentProps<typeof SharePage> = {
  appId: APP_ID,
  shareId: 'share-a',
  customUid: '',
  authToken: '',
  appName: 'Shared app',
  appIntro: 'Shared intro',
  appAvatar: '',
  canDownloadSource: false,
  isShowCite: false,
  isShowFullText: false,
  showRunningStatus: false,
  showSkillReferences: false
};

const findLeafByText = (rootEl: HTMLElement, text: string) =>
  Array.from(rootEl.querySelectorAll<HTMLElement>('button, div, span')).findLast(
    (el) => el.textContent?.trim() === text
  );

const ZH_LABEL = langMap[LangEnum.zh_CN].label;
const EN_LABEL = langMap[LangEnum.en].label;

describe('share page language selector and mobile history drawer', () => {
  let dom: JSDOM;
  let root: Root;
  let container: HTMLElement;

  const renderPage = async (
    query: { showHistory?: string; showHead?: string; showWorkorder?: string } = {}
  ) => {
    mocks.query = { shareId: props.shareId, ...query };
    await act(async () => root.render(React.createElement(SharePage, props)));
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
    mocks.isPlugin = false;
    mocks.isOpenSlider = true;
    mocks.onChangeLng.mockResolvedValue(undefined);
    mocks.init.mockReset().mockResolvedValue(initResponseFixture);
    useChatStore.persist.setOptions({
      storage: createJSONStorage(() => dom.window.sessionStorage)
    });
    useChatStore.setState({
      loaded: true,
      source: 'share',
      appId: APP_ID,
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

  it('switches share language via desktop header selector when history is hidden', async () => {
    await renderPage({ showHistory: '0', showHead: '1' });

    const header = container.querySelector<HTMLElement>('header[data-pc-header="true"]');
    expect(header?.querySelector('[data-popover-placement="bottom-end"]')).not.toBeNull();
    const trigger = header ? findLeafByText(header, ZH_LABEL) : undefined;
    expect(trigger).toBeDefined();

    await act(async () => {
      trigger?.click();
    });
    const englishOption = header ? findLeafByText(header, EN_LABEL) : undefined;
    expect(englishOption).toBeDefined();

    await act(async () => {
      englishOption?.click();
    });
    expect(mocks.onChangeLng).toHaveBeenCalledWith('en', {
      reloadOnChange: true,
      storageKey: SHARE_LANG_KEY
    });
    expect(mocks.updateUserInfo).not.toHaveBeenCalled();
  });

  it('switches share language via mobile header icon and reserves workorder width in flex layout', async () => {
    mocks.isPc = false;
    await renderPage({ showHistory: '0', showHead: '1', showWorkorder: '1' });

    const header = container.querySelector<HTMLElement>('header');
    expect(header?.querySelector('[data-pr="32px"]')).not.toBeNull();
    expect(header?.querySelector('[data-transform]')).toBeNull();

    const iconBtn = header?.querySelector<HTMLButtonElement>(`button[aria-label="${ZH_LABEL}"]`);
    expect(iconBtn).not.toBeNull();
    expect(header?.textContent).not.toContain(ZH_LABEL);

    await act(async () => {
      iconBtn?.click();
    });
    const drawer = container.querySelector<HTMLElement>('[data-phone-drawer="open"]');
    expect(drawer).not.toBeNull();

    const englishOption = drawer ? findLeafByText(drawer, EN_LABEL) : undefined;
    expect(englishOption).toBeDefined();
    await act(async () => {
      englishOption?.click();
    });
    expect(mocks.onChangeLng).toHaveBeenCalledWith('en', {
      reloadOnChange: true,
      storageKey: SHARE_LANG_KEY
    });
    expect(mocks.updateUserInfo).not.toHaveBeenCalled();
  });

  it('keeps sidebar language entry on desktop and avoids duplicating it in the header when history is visible', async () => {
    await renderPage({ showHistory: '1', showHead: '1' });

    const header = container.querySelector<HTMLElement>('header[data-pc-header="true"]');
    const sidebar = container.querySelector<HTMLElement>('aside[data-pc-sidebar="true"]');
    expect(header?.querySelector('[data-popover-placement]')).toBeNull();
    expect(sidebar ? findLeafByText(sidebar, ZH_LABEL) : undefined).toBeDefined();
  });

  it('supports new chat and share language switch inside the mobile drawer without top divider when showHeader is false', async () => {
    mocks.isPc = false;
    await renderPage({ showHistory: '1', showHead: '1' });

    const header = container.querySelector<HTMLElement>('header');
    const drawer = container.querySelector<HTMLElement>('aside[data-mobile-drawer="open"]');
    expect(header?.querySelector(`button[aria-label="${ZH_LABEL}"]`)).toBeNull();
    expect(drawer?.querySelector('[data-slider-divider="true"]')).toBeNull();

    const newChatBtn = drawer ? findLeafByText(drawer, 'common:core.chat.New Chat') : undefined;
    expect(newChatBtn).toBeDefined();
    await act(async () => {
      newChatBtn?.click();
    });
    expect(mocks.chatItem.clearChatRecords).toHaveBeenCalledOnce();
    expect(mocks.chat.onChangeChatId).toHaveBeenCalledOnce();
    expect(mocks.chatItem.setCiteModalData).toHaveBeenCalledWith(undefined);

    const langTrigger = drawer ? findLeafByText(drawer, ZH_LABEL) : undefined;
    expect(langTrigger).toBeDefined();
    await act(async () => {
      langTrigger?.click();
    });
    const phoneDrawer = container.querySelector<HTMLElement>('[data-phone-drawer="open"]');
    const englishOption = phoneDrawer ? findLeafByText(phoneDrawer, EN_LABEL) : undefined;
    expect(englishOption).toBeDefined();
    await act(async () => {
      englishOption?.click();
    });
    expect(mocks.onChangeLng).toHaveBeenCalledWith('en', {
      reloadOnChange: true,
      storageKey: SHARE_LANG_KEY
    });
    expect(mocks.chat.onCloseSlider).toHaveBeenCalledOnce();
  });

  it('keeps the top divider in ChatSliderMobileDrawer when showHeader is true', async () => {
    mocks.isPc = false;
    await act(async () =>
      root.render(
        React.createElement(ChatSliderMobileDrawer, {
          showHeader: true,
          showMenu: true,
          showList: true,
          showFooter: false
        })
      )
    );

    expect(container.querySelector('[data-slider-divider="true"]')).not.toBeNull();
  });

  it.each([
    { isPc: true, showHistory: '0', showHead: '0', isPlugin: false },
    { isPc: false, showHistory: '0', showHead: '0', isPlugin: false },
    { isPc: true, showHistory: '0', showHead: '1', isPlugin: true },
    { isPc: false, showHistory: '0', showHead: '1', isPlugin: true }
  ])('omits language selector when header is hidden or in plugin view: %j', async (scenario) => {
    mocks.isPc = scenario.isPc;
    mocks.isPlugin = scenario.isPlugin;
    await renderPage({ showHistory: scenario.showHistory, showHead: scenario.showHead });

    expect(container.querySelector('[data-icon="common/language/translate"]')).toBeNull();
    expect(container.querySelector(`button[aria-label="${ZH_LABEL}"]`)).toBeNull();
  });
});
