import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useContextSelector } from 'use-context-selector';
import {
  ChatGenerateStatusEnum,
  ChatRoleEnum,
  ChatSourceTypeEnum,
  ChatStatusEnum
} from '@fastgpt/global/core/chat/constants';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { getAppChatSourceKey } from '@/web/core/chat/utils';
import { PluginRunBoxTabEnum } from '@/components/core/chat/ChatContainer/PluginRunBox/constants';
import PluginRunContextProvider, {
  PluginRunContext
} from '@/components/core/chat/ChatContainer/PluginRunBox/context';
import type {
  ChatBoxInputFormType,
  ChatSiteItemType
} from '@/components/core/chat/ChatContainer/ChatBox/type';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';

const mocks = vi.hoisted(() => ({
  getChatHistoryStatus: vi.fn(),
  streamResumeFetch: vi.fn()
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: vi.fn() })
}));
vi.mock('@/web/core/chat/history/api', () => ({
  getChatHistoryStatus: mocks.getChatHistoryStatus
}));
vi.mock('@/web/common/api/fetch', () => ({
  streamResumeFetch: mocks.streamResumeFetch
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

describe('PluginRunContextProvider history status sync & stream resume', () => {
  let onSubmit!: (e: ChatBoxInputFormType) => Promise<any>;
  let setChatBoxData: ReturnType<typeof vi.fn>;
  let setChatRecords: ReturnType<typeof vi.fn>;
  let refreshChatRecords: ReturnType<typeof vi.fn>;
  let setPluginRunTab: ReturnType<typeof vi.fn>;
  let onMarkChatRead: ReturnType<typeof vi.fn>;
  let onChatGenerateStatusChange: ReturnType<typeof vi.fn>;
  let currentRecords: ChatSiteItemType[];

  type RenderState = {
    appId?: string;
    chatId?: string;
    mountPlugin?: boolean;
    outLinkAuthData?: { shareId: string; outLinkUid: string };
    chatGenerateStatus?: ChatGenerateStatusEnum;
    isChatRecordsLoaded?: boolean;
    isReady?: boolean;
    chatRecords?: ChatSiteItemType[];
  };

  const renderProvider = async (
    onStartChat: (props: StartChatFnProps) => Promise<any>,
    initial?: RenderState
  ) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    let state: Required<Pick<RenderState, 'appId' | 'chatId' | 'mountPlugin' | 'isReady'>> &
      RenderState = {
      appId: initial?.appId ?? 'app-1',
      chatId: initial?.chatId ?? 'chat-1',
      mountPlugin: initial?.mountPlugin ?? true,
      isReady: initial?.isReady ?? true,
      outLinkAuthData: initial?.outLinkAuthData,
      chatGenerateStatus: initial?.chatGenerateStatus,
      isChatRecordsLoaded: initial?.isChatRecordsLoaded ?? false
    };
    currentRecords = initial?.chatRecords ?? [];

    const Harness = () => {
      onSubmit = useContextSelector(PluginRunContext, (v) => v.onSubmit);
      return null;
    };

    const renderTree = async (patch?: RenderState) => {
      if (patch) {
        state = { ...state, ...patch };
        if (patch.chatRecords) {
          currentRecords = patch.chatRecords;
        }
      }

      await act(async () => {
        root?.render(
          React.createElement(
            ChatItemContext.Provider,
            {
              value: {
                ...(ChatItemContext as any)._currentValue,
                chatBoxData: {
                  appId: state.appId,
                  sourceKey: getAppChatSourceKey(state.appId),
                  chatId: state.chatId,
                  title: '',
                  chatGenerateStatus: state.chatGenerateStatus,
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
                  chatRecords: currentRecords,
                  setChatRecords,
                  refreshChatRecords,
                  isChatRecordsLoaded: state.isChatRecordsLoaded ?? false
                }
              },
              state.mountPlugin
                ? React.createElement(
                    PluginRunContextProvider,
                    {
                      appId: state.appId,
                      chatId: state.chatId,
                      isReady: state.isReady,
                      outLinkAuthData: state.outLinkAuthData,
                      onStartChat,
                      onMarkChatRead,
                      onChatGenerateStatusChange
                    },
                    React.createElement(Harness)
                  )
                : React.createElement('div', { 'data-testid': 'other-app' })
            )
          )
        );
      });
    };

    await renderTree();
    return {
      rerender: renderTree
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    currentRecords = [];
    setChatBoxData = vi.fn();
    setChatRecords = vi.fn((updater: any) => {
      currentRecords = typeof updater === 'function' ? updater(currentRecords) : updater;
    });
    refreshChatRecords = vi.fn().mockResolvedValue([]);
    setPluginRunTab = vi.fn();
    onMarkChatRead = vi.fn().mockResolvedValue(undefined);
    onChatGenerateStatusChange = vi.fn();
    mocks.getChatHistoryStatus.mockResolvedValue({ list: [] });
    mocks.streamResumeFetch.mockResolvedValue({ responseText: '' });
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

  it('isolates late stream chunks and markRead after unmounting to another app', async () => {
    let capturedProps!: StartChatFnProps;
    let resolveRun!: (value: any) => void;
    const { rerender } = await renderProvider((props) => {
      capturedProps = props;
      return new Promise((resolve) => {
        resolveRun = resolve;
      });
    });

    let submitPromise!: Promise<any>;
    await act(async () => {
      submitPromise = onSubmit({ variables: {} } as ChatBoxInputFormType);
      await Promise.resolve();
    });

    const otherAppRecords: ChatSiteItemType[] = [
      {
        dataId: 'other-app-ai',
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'clean' } }],
        status: ChatStatusEnum.finish
      }
    ];
    // 切换至普通对话应用：卸载插件 Provider，外层 ChatRecordContext 保留新应用记录
    await rerender({
      appId: 'app-2',
      chatId: 'chat-other',
      mountPlugin: false,
      chatRecords: otherAppRecords
    });
    setChatRecords.mockClear();
    setChatBoxData.mockClear();

    expect(capturedProps.controller.signal.aborted).toBe(true);
    expect(capturedProps.controller.signal.reason).toBe('leave');

    await act(async () => {
      capturedProps.generatingMessage({
        event: SseResponseEventEnum.answer,
        text: 'leaked-text'
      });
      resolveRun({ responseText: 'ok', isNewChat: true });
      await submitPromise;
      await Promise.resolve();
    });

    expect(setChatRecords).not.toHaveBeenCalled();
    expect(setChatBoxData).not.toHaveBeenCalled();
    expect(currentRecords[0]?.value[0]?.text?.content).toBe('clean');
    expect(onMarkChatRead).not.toHaveBeenCalled();
    expect(onChatGenerateStatusChange).toHaveBeenCalledTimes(1);
  });

  it('leaves run A generating on chat switch and lets run B finish independently first', async () => {
    const runs: Array<{
      chatId: string;
      props: StartChatFnProps;
      resolve: (value: any) => void;
    }> = [];
    const { rerender } = await renderProvider(
      (props) =>
        new Promise((resolve) => {
          runs.push({
            chatId: runs.length === 0 ? 'chat-a' : 'chat-b',
            props,
            resolve
          });
        }),
      { chatId: 'chat-a', outLinkAuthData: { shareId: 'share-1', outLinkUid: 'uid-1' } }
    );

    let promiseA!: Promise<any>;
    await act(async () => {
      promiseA = onSubmit({ variables: {} } as ChatBoxInputFormType);
      await Promise.resolve();
    });

    // 切到新会话 B，A 仅按 leave 断开本地订阅，不提前发出 done
    await rerender({ chatId: 'chat-b', chatRecords: [] });
    expect(runs[0].props.controller.signal.aborted).toBe(true);
    expect(runs[0].props.controller.signal.reason).toBe('leave');

    let promiseB!: Promise<any>;
    await act(async () => {
      promiseB = onSubmit({ variables: {} } as ChatBoxInputFormType);
      await Promise.resolve();
    });
    expect(runs[1].props.controller.signal.aborted).toBe(false);

    // B 先完成，随后 A 的客户端流返回
    await act(async () => {
      runs[1].resolve({ responseText: 'ok-b', isNewChat: true });
      await promiseB;
      await Promise.resolve();
    });

    await act(async () => {
      runs[0].resolve({ responseText: 'partial-a', isNewChat: true });
      await promiseA;
      await Promise.resolve();
    });

    expect(onMarkChatRead).toHaveBeenCalledExactlyOnceWith({
      outLinkAuthData: { shareId: 'share-1', outLinkUid: 'uid-1' },
      chatId: 'chat-b'
    });
    expect(
      onChatGenerateStatusChange.mock.calls.filter(
        ([payload]) => payload.chatId === 'chat-a' && payload.status === ChatGenerateStatusEnum.done
      )
    ).toHaveLength(0);
    expect(onChatGenerateStatusChange).toHaveBeenLastCalledWith({
      sourceTarget: { sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' },
      chatId: 'chat-b',
      status: ChatGenerateStatusEnum.done,
      hasBeenRead: true,
      title: undefined
    });
  });

  it('reconciles with server status when client stream aborts without leave', async () => {
    mocks.getChatHistoryStatus.mockResolvedValueOnce({
      list: [{ chatId: 'chat-1', chatGenerateStatus: ChatGenerateStatusEnum.generating }]
    });

    await renderProvider(async ({ controller }) => {
      controller.abort('stop');
      return { responseText: 'partial', isNewChat: true };
    });

    await act(async () => {
      await onSubmit({ variables: {} } as ChatBoxInputFormType);
      await Promise.resolve();
    });

    expect(mocks.getChatHistoryStatus).toHaveBeenCalledExactlyOnceWith({
      appId: 'app-1',
      chatIds: ['chat-1']
    });
    expect(onMarkChatRead).not.toHaveBeenCalled();
    expect(
      onChatGenerateStatusChange.mock.calls.some(
        ([payload]) => payload.status === ChatGenerateStatusEnum.done
      )
    ).toBe(false);
  });

  it('auto-resumes a generating plugin session and marks read on completion', async () => {
    mocks.streamResumeFetch.mockImplementationOnce(async ({ onmessage }) => {
      onmessage({
        event: SseResponseEventEnum.answer,
        text: 'resumed-answer'
      });
      return {
        responseText: 'resumed-answer',
        completedChat: {
          chatGenerateStatus: ChatGenerateStatusEnum.done,
          hasBeenRead: true,
          records: {
            list: [
              {
                id: 'ai-resumed',
                dataId: 'ai-resumed',
                obj: ChatRoleEnum.AI,
                value: [{ text: { content: 'resumed-answer' } }],
                responseData: [
                  {
                    id: 'plugin-out',
                    nodeId: 'plugin-out',
                    moduleName: 'Plugin Output',
                    pluginOutput: { result: 42 }
                  }
                ]
              }
            ],
            total: 1,
            hasMorePrev: false,
            hasMoreNext: false
          }
        }
      };
    });

    await renderProvider(vi.fn(), {
      chatId: 'chat-resume',
      outLinkAuthData: { shareId: 'share-1', outLinkUid: 'uid-1' },
      chatGenerateStatus: ChatGenerateStatusEnum.generating,
      isChatRecordsLoaded: true
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.streamResumeFetch).toHaveBeenCalledOnce();
    expect(mocks.streamResumeFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'chat-resume',
        outLinkAuthData: { shareId: 'share-1', outLinkUid: 'uid-1' }
      })
    );
    expect(setPluginRunTab).toHaveBeenCalledWith(PluginRunBoxTabEnum.output);
    expect(currentRecords[0]?.value[0]?.text?.content).toBe('resumed-answer');
    expect(onMarkChatRead).toHaveBeenCalledExactlyOnceWith({
      outLinkAuthData: { shareId: 'share-1', outLinkUid: 'uid-1' },
      chatId: 'chat-resume'
    });
    expect(onChatGenerateStatusChange).toHaveBeenLastCalledWith({
      sourceTarget: { sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' },
      chatId: 'chat-resume',
      status: ChatGenerateStatusEnum.done,
      hasBeenRead: true,
      title: undefined
    });
  });

  it('recovers via stream resume when submitting against an already generating chat', async () => {
    const recoveredRecords: ChatSiteItemType[] = [
      {
        dataId: 'ai-running-1',
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: '' } }],
        status: ChatStatusEnum.finish
      }
    ];
    refreshChatRecords.mockResolvedValueOnce(recoveredRecords);
    mocks.streamResumeFetch.mockResolvedValueOnce({ responseText: 'recovered' });

    const { rerender } = await renderProvider(
      async () => {
        throw {
          statusText: ChatErrEnum.chatIsGenerating,
          data: { responseChatItemId: 'ai-running-1', reusePreviousAi: false }
        };
      },
      {
        chatId: 'chat-conflict',
        isChatRecordsLoaded: true
      }
    );

    await act(async () => {
      await onSubmit({ variables: {} } as ChatBoxInputFormType);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    // 模拟外层 ChatItemContext / ChatRecordContext 接收回滚和 generating 更新
    await rerender({
      chatId: 'chat-conflict',
      isChatRecordsLoaded: true,
      chatGenerateStatus: ChatGenerateStatusEnum.generating,
      chatRecords: currentRecords
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(refreshChatRecords).toHaveBeenCalledOnce();
    expect(mocks.streamResumeFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'app-1',
        chatId: 'chat-conflict'
      })
    );
  });

  it('clears optimistic placeholder on timeout abort when round was never persisted', async () => {
    mocks.getChatHistoryStatus.mockResolvedValueOnce({ list: [] });

    await renderProvider(async ({ controller }) => {
      controller.abort('timeout');
      return { responseText: '', isNewChat: true };
    });

    await act(async () => {
      await onSubmit({ variables: {} } as ChatBoxInputFormType);
      await Promise.resolve();
    });

    expect(currentRecords).toEqual([]);
    expect(setPluginRunTab).toHaveBeenLastCalledWith(PluginRunBoxTabEnum.input);
    expect(onMarkChatRead).not.toHaveBeenCalled();
    expect(onChatGenerateStatusChange).toHaveBeenLastCalledWith({
      sourceTarget: { sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' },
      chatId: 'chat-1',
      status: ChatGenerateStatusEnum.done,
      hasBeenRead: true,
      title: undefined
    });
  });

  it('hands off to stream resume on un-aborted network drop while server is still generating', async () => {
    const recoveredRecords: ChatSiteItemType[] = [
      {
        dataId: 'ai-live-1',
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: '' } }],
        status: ChatStatusEnum.finish
      }
    ];
    mocks.getChatHistoryStatus.mockResolvedValueOnce({
      list: [{ chatId: 'chat-net', chatGenerateStatus: ChatGenerateStatusEnum.generating }]
    });
    refreshChatRecords.mockResolvedValueOnce(recoveredRecords);
    mocks.streamResumeFetch.mockResolvedValueOnce({ responseText: 'resumed-after-drop' });

    const { rerender } = await renderProvider(
      async () => {
        throw new Error('network reset');
      },
      {
        chatId: 'chat-net',
        isChatRecordsLoaded: true
      }
    );

    await act(async () => {
      await onSubmit({ variables: {} } as ChatBoxInputFormType);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(currentRecords).toEqual([]);
    expect(onMarkChatRead).not.toHaveBeenCalled();
    expect(
      onChatGenerateStatusChange.mock.calls.some(
        ([payload]) => payload.status === ChatGenerateStatusEnum.done
      )
    ).toBe(false);

    await rerender({
      chatId: 'chat-net',
      isChatRecordsLoaded: true,
      chatGenerateStatus: ChatGenerateStatusEnum.generating,
      chatRecords: currentRecords
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(refreshChatRecords).toHaveBeenCalledOnce();
    expect(mocks.streamResumeFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'app-1',
        chatId: 'chat-net'
      })
    );
  });

  it('marks read and emits done status when a persisted plugin run fails', async () => {
    mocks.getChatHistoryStatus.mockResolvedValueOnce({
      list: [{ chatId: 'chat-1', chatGenerateStatus: ChatGenerateStatusEnum.done }]
    });

    await renderProvider(async () => {
      throw new Error('plugin failed');
    });

    await act(async () => {
      await onSubmit({ variables: {} } as ChatBoxInputFormType);
      await new Promise((resolve) => setTimeout(resolve, 10));
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

  it('refreshes persisted answer and pluginOutput when stream drops after server already completed', async () => {
    const persistedRecords: ChatSiteItemType[] = [
      {
        dataId: 'human-persisted',
        obj: ChatRoleEnum.Human,
        value: [{ text: { content: '{}' } }],
        status: ChatStatusEnum.finish
      },
      {
        dataId: 'ai-persisted',
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'full persisted answer' } }],
        responseData: [
          {
            id: 'plugin-out',
            nodeId: 'plugin-out',
            moduleName: 'Plugin Output',
            pluginOutput: { result: 'complete-output' }
          } as any
        ],
        status: ChatStatusEnum.finish
      }
    ];
    mocks.getChatHistoryStatus.mockResolvedValueOnce({
      list: [{ chatId: 'chat-1', chatGenerateStatus: ChatGenerateStatusEnum.done }]
    });
    refreshChatRecords.mockResolvedValueOnce(persistedRecords);

    await renderProvider(async ({ generatingMessage }) => {
      generatingMessage({
        event: SseResponseEventEnum.answer,
        text: 'partial'
      });
      throw new Error('connection dropped at tail');
    });

    await act(async () => {
      await onSubmit({ variables: {} } as ChatBoxInputFormType);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(refreshChatRecords).toHaveBeenCalledOnce();
    expect(currentRecords).toHaveLength(2);
    expect(currentRecords[1]?.value[0]?.text?.content).toBe('full persisted answer');
    expect(currentRecords[1]?.responseData?.[0]?.pluginOutput).toEqual({
      result: 'complete-output'
    });
    expect(currentRecords[1]?.status).toBe(ChatStatusEnum.finish);
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

  it('skips record write and markRead if user switches chat while refreshing completed interrupted run', async () => {
    const refreshDeferred = Promise.withResolvers<ChatSiteItemType[]>();
    mocks.getChatHistoryStatus.mockResolvedValueOnce({
      list: [{ chatId: 'chat-1', chatGenerateStatus: ChatGenerateStatusEnum.done }]
    });
    refreshChatRecords.mockReturnValueOnce(refreshDeferred.promise);

    const { rerender } = await renderProvider(async () => {
      throw new Error('tail disconnect');
    });

    let submitPromise!: Promise<any>;
    await act(async () => {
      submitPromise = onSubmit({ variables: {} } as ChatBoxInputFormType);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(refreshChatRecords).toHaveBeenCalledOnce();

    const otherChatRecords: ChatSiteItemType[] = [
      {
        dataId: 'other-ai',
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'other chat content' } }],
        status: ChatStatusEnum.finish
      }
    ];
    await rerender({ chatId: 'chat-2', chatRecords: otherChatRecords });
    setChatRecords.mockClear();

    await act(async () => {
      refreshDeferred.resolve([
        {
          dataId: 'ai-stale',
          obj: ChatRoleEnum.AI,
          value: [{ text: { content: 'stale answer' } }],
          status: ChatStatusEnum.finish
        }
      ]);
      await submitPromise;
      await Promise.resolve();
    });

    expect(setChatRecords).not.toHaveBeenCalled();
    expect(currentRecords[0]?.value[0]?.text?.content).toBe('other chat content');
    expect(onMarkChatRead).not.toHaveBeenCalled();
    expect(onChatGenerateStatusChange).toHaveBeenLastCalledWith({
      sourceTarget: { sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' },
      chatId: 'chat-1',
      status: ChatGenerateStatusEnum.done,
      hasBeenRead: false,
      title: undefined
    });
  });
});
