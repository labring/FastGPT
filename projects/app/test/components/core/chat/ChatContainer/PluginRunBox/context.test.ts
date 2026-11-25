import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useContextSelector } from 'use-context-selector';
import { ChatGenerateStatusEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import PluginRunContextProvider, {
  PluginRunContext
} from '@/components/core/chat/ChatContainer/PluginRunBox/context';
import type { ChatBoxInputFormType } from '@/components/core/chat/ChatContainer/ChatBox/type';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: vi.fn() })
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

describe('PluginRunContextProvider history status sync', () => {
  let onSubmit!: (e: ChatBoxInputFormType) => Promise<any>;
  let setChatBoxData: ReturnType<typeof vi.fn>;
  let setChatRecords: ReturnType<typeof vi.fn>;
  let setPluginRunTab: ReturnType<typeof vi.fn>;
  let onMarkChatRead: ReturnType<typeof vi.fn>;
  let onChatGenerateStatusChange: ReturnType<typeof vi.fn>;

  const renderProvider = async (
    onStartChat: (props: StartChatFnProps) => Promise<any>,
    options?: {
      chatId?: string;
      outLinkAuthData?: { shareId: string; outLinkUid: string };
    }
  ) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const Harness = () => {
      onSubmit = useContextSelector(PluginRunContext, (v) => v.onSubmit);
      return null;
    };

    const renderWithProps = async (currentChatId: string) => {
      await act(async () => {
        root?.render(
          React.createElement(
            ChatItemContext.Provider,
            {
              value: {
                ...(ChatItemContext as any)._currentValue,
                chatBoxData: {
                  appId: 'app-1',
                  chatId: currentChatId,
                  title: '',
                  app: { pluginInputs: [], chatConfig: {} }
                },
                setChatBoxData,
                setPluginRunTab,
                resetVariables: vi.fn()
              }
            },
            React.createElement(
              ChatRecordContext.Provider,
              {
                value: {
                  ...(ChatRecordContext as any)._currentValue,
                  chatRecords: [],
                  setChatRecords
                }
              },
              React.createElement(
                PluginRunContextProvider,
                {
                  appId: 'app-1',
                  chatId: currentChatId,
                  outLinkAuthData: options?.outLinkAuthData,
                  onStartChat,
                  onMarkChatRead,
                  onChatGenerateStatusChange
                },
                React.createElement(Harness)
              )
            )
          )
        );
      });
    };

    await renderWithProps(options?.chatId ?? 'chat-1');
    return { rerenderChatId: renderWithProps };
  };

  beforeEach(() => {
    setChatBoxData = vi.fn();
    setChatRecords = vi.fn();
    setPluginRunTab = vi.fn();
    onMarkChatRead = vi.fn().mockResolvedValue(undefined);
    onChatGenerateStatusChange = vi.fn();
  });

  it('emits generating, chatTitle, marks read, and emits done status events when a plugin run completes', async () => {
    await renderProvider(
      async ({ generatingMessage }) => {
        generatingMessage({
          event: SseResponseEventEnum.chatTitle,
          title: '2026-11-25 18:35:00 Wednesday'
        });
        return { responseText: 'ok', isNewChat: true };
      },
      { outLinkAuthData: { shareId: 'share-1', outLinkUid: 'uid-1' } }
    );

    await act(async () => {
      await onSubmit({ variables: {} } as ChatBoxInputFormType);
      await Promise.resolve();
    });

    expect(onChatGenerateStatusChange).toHaveBeenNthCalledWith(1, {
      sourceTarget: { sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' },
      chatId: 'chat-1',
      status: ChatGenerateStatusEnum.generating,
      hasBeenRead: false,
      title: undefined
    });
    expect(onChatGenerateStatusChange).toHaveBeenNthCalledWith(2, {
      sourceTarget: { sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' },
      chatId: 'chat-1',
      status: ChatGenerateStatusEnum.generating,
      hasBeenRead: undefined,
      title: '2026-11-25 18:35:00 Wednesday'
    });
    expect(onMarkChatRead).toHaveBeenCalledExactlyOnceWith({
      outLinkAuthData: { shareId: 'share-1', outLinkUid: 'uid-1' },
      chatId: 'chat-1'
    });
    expect(onChatGenerateStatusChange).toHaveBeenNthCalledWith(3, {
      sourceTarget: { sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' },
      chatId: 'chat-1',
      status: ChatGenerateStatusEnum.done,
      hasBeenRead: true,
      title: undefined
    });
    expect(setChatBoxData).toHaveBeenCalledTimes(3);
  });

  it('keeps unread status and avoids mutating active records when user switches chat mid-run', async () => {
    let resolveRun!: (value: any) => void;
    const { rerenderChatId } = await renderProvider(
      () =>
        new Promise((resolve) => {
          resolveRun = resolve;
        })
    );

    let submitPromise!: Promise<any>;
    await act(async () => {
      submitPromise = onSubmit({ variables: {} } as ChatBoxInputFormType);
      await Promise.resolve();
    });

    // 用户在插件运行途中切换到新会话
    await rerenderChatId('chat-2');
    setChatRecords.mockClear();

    await act(async () => {
      resolveRun({ responseText: 'ok', isNewChat: true });
      await submitPromise;
      await Promise.resolve();
    });

    expect(onMarkChatRead).not.toHaveBeenCalled();
    expect(setChatRecords).not.toHaveBeenCalled();
    expect(onChatGenerateStatusChange).toHaveBeenLastCalledWith({
      sourceTarget: { sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' },
      chatId: 'chat-1',
      status: ChatGenerateStatusEnum.done,
      hasBeenRead: false,
      title: undefined
    });
  });

  it('marks read and emits done status when a plugin run fails', async () => {
    await renderProvider(async () => {
      throw new Error('plugin failed');
    });

    await act(async () => {
      await onSubmit({ variables: {} } as ChatBoxInputFormType);
      await Promise.resolve();
    });

    expect(onMarkChatRead).toHaveBeenCalledExactlyOnceWith({
      appId: 'app-1',
      chatId: 'chat-1'
    });
    expect(onChatGenerateStatusChange).toHaveBeenLastCalledWith({
      sourceTarget: { sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' },
      chatId: 'chat-1',
      status: ChatGenerateStatusEnum.done,
      hasBeenRead: true,
      title: undefined
    });
  });
});
