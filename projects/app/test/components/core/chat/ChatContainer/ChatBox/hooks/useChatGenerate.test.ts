import { JSDOM } from 'jsdom';
import React, { act, useLayoutEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useForm } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { ChatBoxContext } from '@/components/core/chat/ChatContainer/ChatBox/Provider';
import { WorkflowRuntimeContext } from '@/components/core/chat/ChatContainer/context/workflowRuntimeContext';
import { useChatGenerate } from '@/components/core/chat/ChatContainer/ChatBox/hooks/useChatGenerate';
import {
  ChatGenerateStatusEnum,
  ChatRoleEnum,
  ChatSourceTypeEnum,
  ChatStatusEnum
} from '@fastgpt/global/core/chat/constants';
import type {
  ChatBoxInputFormType,
  ChatSiteItemType
} from '@/components/core/chat/ChatContainer/ChatBox/type';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  toast: vi.fn(),
  startAudio: vi.fn(),
  finishAudio: vi.fn(),
  resetInput: vi.fn(),
  notifyStatus: vi.fn(),
  finishStatus: vi.fn(),
  createGuide: vi.fn(),
  splitAudio: vi.fn(),
  scroll: vi.fn()
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@fastgpt/web/hooks/useSystem', () => ({ useSystem: () => ({ isPc: true }) }));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ setNotSufficientModalType: () => {} })
}));

const sourceKey = 'app:app';

describe('useChatGenerate lifecycle completion', () => {
  let dom: JSDOM;
  let root: Root;
  let generate: ReturnType<typeof useChatGenerate>;
  let records: ChatSiteItemType[];

  const Harness = ({ chatId }: { chatId: string }) => {
    const textarea = useRef<HTMLTextAreaElement>(null);
    const activeSource = useRef<string | undefined>(sourceKey);
    const activeChat = useRef<string | undefined>(chatId);
    useLayoutEffect(() => {
      activeChat.current = chatId;
    }, [chatId]);
    generate = useChatGenerate({
      onStartChat: mocks.start,
      isRoundPending: false,
      chatControllerRef: useRef(new AbortController()),
      questionGuideControllerRef: useRef(new AbortController()),
      pluginControllerRef: useRef(new AbortController()),
      resumeControllerRef: useRef(undefined),
      resumedChatTargetRef: useRef(undefined),
      activeSourceKeyRef: activeSource,
      activeChatIdRef: activeChat,
      TextareaDom: textarea,
      resetInputVal: mocks.resetInput,
      setQuestionGuide: () => {},
      createQuestionGuide: mocks.createGuide,
      scrollToBottom: () => {},
      generatingScroll: mocks.scroll,
      notifyChatGenerateStatusChange: mocks.notifyStatus,
      finishChatGenerateStatus: mocks.finishStatus
    });
    return React.createElement('textarea', { ref: textarea });
  };

  /** 使用真实表单、context 和 React 状态，模拟切换会话时替换聊天记录。 */
  const Wrapper = ({ chatId }: { chatId: string }) => {
    const variablesForm = useForm<ChatBoxInputFormType>({
      defaultValues: { input: '', files: [], chatStarted: false, variables: {} }
    });
    const [chatRecords, setChatRecords] = useState<ChatSiteItemType[]>([]);
    records = chatRecords;
    useLayoutEffect(() => {
      if (chatId === 'B') {
        setChatRecords([
          {
            id: 'B-reply',
            dataId: 'B-reply',
            obj: ChatRoleEnum.AI,
            status: ChatStatusEnum.finish,
            value: [{ text: { content: 'B reply' } }]
          }
        ]);
      }
    }, [chatId]);
    const [chatBoxData, setChatBoxData] = useState({ appId: 'app', sourceKey, chatId });
    const runtime = {
      sourceTarget: { sourceType: ChatSourceTypeEnum.app, sourceId: 'app' },
      sourceKey,
      chatId,
      outLinkAuthData: {},
      fileUploadMode: 'runtime' as const,
      fileUploading: false,
      setFileUploadingCount: () => {}
    };
    const item = {
      variablesForm,
      chatBoxData,
      setChatBoxData,
      resetVariables: () => {}
    } as unknown as React.ComponentProps<typeof ChatItemContext.Provider>['value'];
    const record = { chatRecords, setChatRecords } as unknown as React.ComponentProps<
      typeof ChatRecordContext.Provider
    >['value'];
    const chat = {
      variableList: [],
      startSegmentedAudio: mocks.startAudio,
      finishSegmentedAudio: mocks.finishAudio,
      setAudioPlayingChatId: () => {},
      splitText2Audio: mocks.splitAudio
    } as unknown as React.ComponentProps<typeof ChatBoxContext.Provider>['value'];
    // use-context-selector 的 Provider 类型要求 children 显式位于 props 中。
    /* eslint-disable react/no-children-prop */
    return React.createElement(WorkflowRuntimeContext.Provider, {
      value: runtime,
      children: React.createElement(ChatItemContext.Provider, {
        value: item,
        children: React.createElement(ChatRecordContext.Provider, {
          value: record,
          children: React.createElement(ChatBoxContext.Provider, {
            value: chat,
            children: React.createElement(Harness, { chatId })
          })
        })
      })
    });
    /* eslint-enable react/no-children-prop */
  };
  const render = async (chatId = 'A') =>
    act(async () => root.render(React.createElement(Wrapper, { chatId })));
  const send = async (autoTTSResponse = false) =>
    act(async () =>
      generate.sendPrompt({ text: 'A question', files: [], clearInput: true, autoTTSResponse })
    );

  beforeEach(() => {
    dom = new JSDOM('<div id="root"></div>', { url: 'https://fastgpt.example' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => callback(0));
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.start.mockResolvedValue({ responseText: 'answer' });
    mocks.startAudio.mockResolvedValue(undefined);
    root = createRoot(document.getElementById('root')!);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.clearAllTimers();
    vi.useRealTimers();
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it.each(['resolve', 'reject'] as const)(
    'keeps A generating after leaving for B when the aborted stream %ss',
    async (outcome) => {
      mocks.start.mockImplementationOnce(
        ({ controller }: { controller: AbortController }) =>
          new Promise((resolve, reject) => {
            controller.signal.addEventListener(
              'abort',
              () => {
                if (outcome === 'resolve') resolve({ responseText: 'partial answer' });
                else reject(new DOMException('The operation was aborted', 'AbortError'));
              },
              { once: true }
            );
          })
      );
      await render();
      await send(true);
      expect(mocks.notifyStatus).toHaveBeenLastCalledWith(
        ChatGenerateStatusEnum.generating,
        expect.objectContaining({ targetChatId: 'A', hasBeenRead: false })
      );

      await render('B');
      const currentRecords = records;
      const focus = vi.spyOn(document.querySelector('textarea')!, 'focus');
      await act(async () => generate.abortRequest('leave'));
      await act(async () => vi.advanceTimersByTimeAsync(100));

      expect(mocks.start.mock.calls[0][0].controller.signal.reason.message).toBe('leave');
      expect(mocks.finishStatus).not.toHaveBeenCalled();
      expect(mocks.notifyStatus).toHaveBeenCalledOnce();
      expect(records).toBe(currentRecords);
      expect(mocks.resetInput).toHaveBeenCalledOnce();
      expect(mocks.createGuide).not.toHaveBeenCalled();
      expect(mocks.scroll).not.toHaveBeenCalled();
      expect(focus).not.toHaveBeenCalled();
      expect(mocks.splitAudio).not.toHaveBeenCalled();
      expect(mocks.finishAudio).toHaveBeenCalledOnce();
    }
  );

  it('still finishes the active conversation after an explicit stop', async () => {
    mocks.start.mockImplementationOnce(
      ({ controller }: { controller: AbortController }) =>
        new Promise((resolve) => {
          controller.signal.addEventListener(
            'abort',
            () => resolve({ responseText: 'partial answer' }),
            { once: true }
          );
        })
    );
    await render();
    await send();
    await act(async () => generate.abortRequest('stop'));
    expect(mocks.finishStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ChatGenerateStatusEnum.done,
        targetChatId: 'A',
        finishedInActiveChat: true
      })
    );
  });

  it('still finishes a normally completed response', async () => {
    await render();
    await send();
    expect(mocks.finishStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: ChatGenerateStatusEnum.done, finishedInActiveChat: true })
    );
    expect(records.at(-1)?.status).toBe(ChatStatusEnum.finish);
  });

  it('still reports a genuine request failure', async () => {
    mocks.start.mockRejectedValueOnce(new Error('network error'));
    await render();
    await send();
    expect(mocks.finishStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: ChatGenerateStatusEnum.error, finishedInActiveChat: true })
    );
    expect(records.at(-1)?.errorMsg).toBe('network error');
  });
});
