import { JSDOM } from 'jsdom';
import React, { act, useLayoutEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useForm } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { ChatBoxContext } from '@/components/core/chat/ChatContainer/ChatBox/Provider';
import { WorkflowRuntimeContext } from '@/components/core/chat/ChatContainer/context/workflowRuntimeContext';
import { useChatInputForm } from '@/components/core/chat/ChatContainer/ChatBox/hooks/useChatInputForm';
import { useChatGenerate } from '@/components/core/chat/ChatContainer/ChatBox/hooks/useChatGenerate';
import ChatInput from '@/components/core/chat/ChatContainer/ChatBox/Input/ChatInput';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
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
import { clearChatInputDrafts, readChatInputDraft } from '@/web/core/chat/inputDraft/storage';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  toast: vi.fn(),
  startAudio: vi.fn(),
  finishAudio: vi.fn(),
  notifyStatus: vi.fn(),
  finishStatus: vi.fn(),
  createGuide: vi.fn(),
  splitAudio: vi.fn(),
  scroll: vi.fn(),
  system: { isPc: false }
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@fastgpt/web/hooks/useSystem', () => ({ useSystem: () => mocks.system }));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: { limit: {} }, setNotSufficientModalType: () => {} })
}));
vi.mock('@/components/core/chat/ChatContainer/ChatBox/Input/VoiceInput', async () => {
  const { createElement, forwardRef, useImperativeHandle } = await import('react');
  return {
    // 只替换麦克风和转录服务，保留 ChatInput 的真实语音发送入口。
    default: forwardRef<unknown, { handleSend: (text: string) => void }>(({ handleSend }, ref) => {
      useImperativeHandle(ref, () => ({ onSpeak: () => {} }));
      return createElement('button', { onClick: () => handleSend('spoken input') }, 'voice-send');
    })
  };
});

const identity = { tmbId: 'member', appId: 'app', chatId: 'A' };
const sourceKey = 'app:app';
const file = {
  id: 'file',
  uploadId: 'upload',
  key: 'chat/file.pdf',
  name: 'file.pdf',
  type: 'file' as const,
  url: 'https://old',
  icon: 'icon',
  status: 1 as const
};

describe('useChatGenerate.sendPrompt', () => {
  let dom: JSDOM;
  let root: Root;
  let input: ReturnType<typeof useChatInputForm>;
  let generate: ReturnType<typeof useChatGenerate>;
  let records: ChatSiteItemType[];
  let setRecords: React.Dispatch<React.SetStateAction<ChatSiteItemType[]>>;

  const Harness = ({
    chatId,
    pending,
    tmbId,
    withComposer
  }: {
    chatId: string;
    pending: boolean;
    tmbId: string;
    withComposer: boolean;
  }) => {
    const textarea = useRef<HTMLTextAreaElement>(null);
    const activeSource = useRef<string | undefined>(sourceKey);
    const activeChat = useRef<string | undefined>(chatId);
    useLayoutEffect(() => {
      activeChat.current = chatId;
    }, [chatId]);
    input = useChatInputForm({
      sourceKey,
      chatId,
      draftIdentity: { ...identity, tmbId, chatId },
      chatBoxSourceKey: sourceKey,
      chatRecordsLength: records.length,
      chatType: ChatTypeEnum.chat,
      variableList: [],
      TextareaDom: textarea
    });
    generate = useChatGenerate({
      onStartChat: mocks.start,
      isRoundPending: pending,
      chatControllerRef: useRef(new AbortController()),
      questionGuideControllerRef: useRef(new AbortController()),
      pluginControllerRef: useRef(new AbortController()),
      resumeControllerRef: useRef(undefined),
      resumedChatTargetRef: useRef(undefined),
      activeSourceKeyRef: activeSource,
      activeChatIdRef: activeChat,
      TextareaDom: textarea,
      captureSubmittedInput: input.captureSubmittedInput,
      isSubmittedInputCurrent: input.isSubmittedInputCurrent,
      clearSubmittedInput: input.clearSubmittedInput,
      restoreSubmittedInput: input.restoreSubmittedInput,
      setQuestionGuide: () => {},
      createQuestionGuide: mocks.createGuide,
      scrollToBottom: () => {},
      generatingScroll: mocks.scroll,
      notifyChatGenerateStatusChange: mocks.notifyStatus,
      finishChatGenerateStatus: mocks.finishStatus
    });
    return withComposer
      ? React.createElement(ChatInput, {
          onSendMessage: generate.sendPrompt,
          onStopChat: async () => {},
          enableInputGuide: false,
          enableVoiceInput: true,
          TextareaDom: textarea,
          textareaRef: input.textareaRef,
          resetInputVal: input.resetInputVal,
          chatForm: input.chatForm
        })
      : React.createElement('textarea', { ref: textarea });
  };

  const Wrapper = ({
    chatId,
    required,
    pending,
    tmbId,
    withComposer
  }: {
    chatId: string;
    required: boolean;
    pending: boolean;
    tmbId: string;
    withComposer: boolean;
  }) => {
    const variablesForm = useForm<ChatBoxInputFormType>({
      defaultValues: { input: '', files: [], chatStarted: false, variables: { required: '' } }
    });
    variablesForm.register('variables.required', { required });
    const [chatRecords, setChatRecords] = useState<ChatSiteItemType[]>([]);
    records = chatRecords;
    setRecords = setChatRecords;
    const [chatBoxData, setChatBoxData] = useState({
      appId: 'app',
      sourceKey,
      chatId,
      app: { name: 'App' }
    });
    const runtime: React.ComponentProps<typeof WorkflowRuntimeContext.Provider>['value'] = {
      sourceTarget: { sourceType: ChatSourceTypeEnum.app, sourceId: 'app' },
      sourceKey,
      chatId,
      outLinkAuthData: {},
      fileUploadMode: 'runtime' as const,
      fileUploading: false,
      setFileUploadingCount: () => {}
    };
    // 仅提供发送 hook 消费的 context 字段；表单校验、records 更新和草稿逻辑均使用真实实现。
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
      splitText2Audio: mocks.splitAudio,
      fileSelectConfig: { canSelectFile: true, canSelectImg: true },
      whisperConfig: { open: true, autoSend: true },
      chatInputGuide: { open: false }
    } as unknown as React.ComponentProps<typeof ChatBoxContext.Provider>['value'];
    /* eslint-disable react/no-children-prop -- Provider 的 children 为必填，createElement 的第三参无法满足该类型约束。 */
    return React.createElement(WorkflowRuntimeContext.Provider, {
      value: runtime,
      children: React.createElement(ChatItemContext.Provider, {
        value: item,
        children: React.createElement(ChatRecordContext.Provider, {
          value: record,
          children: React.createElement(ChatBoxContext.Provider, {
            value: chat,
            children: React.createElement(Harness, { chatId, pending, tmbId, withComposer })
          })
        })
      })
    });
    /* eslint-enable react/no-children-prop */
  };
  const render = async ({
    chatId = 'A',
    required = false,
    pending = false,
    tmbId = identity.tmbId,
    withComposer = false
  } = {}) =>
    act(async () =>
      root.render(React.createElement(Wrapper, { chatId, required, pending, tmbId, withComposer }))
    );
  const edit = async (text: string, files: (typeof file)[] = []) =>
    act(async () => input.resetInputVal({ text, files }));
  const send = async ({ clearInput = true, text = 'submitted', autoTTSResponse = false } = {}) =>
    act(async () =>
      generate.sendPrompt({
        text,
        files: input.chatForm.getValues('files'),
        clearInput,
        autoTTSResponse
      })
    );

  beforeEach(() => {
    dom = new JSDOM('<div id="root"></div>', {
      url: 'https://fastgpt.example',
      pretendToBeVisual: true
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('FileList', dom.window.FileList);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => callback(0));
    vi.useFakeTimers();
    clearChatInputDrafts();
    vi.clearAllMocks();
    mocks.system.isPc = false;
    mocks.start.mockResolvedValue({ responseText: 'answer' });
    mocks.startAudio.mockResolvedValue(undefined);
    root = createRoot(document.getElementById('root')!);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.clearAllTimers();
    vi.useRealTimers();
    clearChatInputDrafts();
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it.each([
    { required: true, pending: false },
    { required: false, pending: true }
  ])('preserves input when submission is blocked by %o', async (options) => {
    await render(options);
    await edit('submitted', [file]);
    await send();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(records).toEqual([]);
    expect(input.chatForm.getValues('input')).toBe('submitted');
    expect(input.chatForm.getValues('files')).toHaveLength(1);
    expect(readChatInputDraft(identity)?.files).toHaveLength(1);
  });

  it('restores voice auto-send text and attachments after a failure through the real input entry', async () => {
    const request = Promise.withResolvers<{ responseText: string }>();
    mocks.start.mockReturnValueOnce(request.promise);
    await render({ withComposer: true });
    await edit('', [file]);
    const voiceButton = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === 'voice-send'
    );
    expect(voiceButton).toBeDefined();
    await act(async () => voiceButton?.click());
    expect(mocks.start).toHaveBeenCalledOnce();
    expect(input.chatForm.getValues('input')).toBe('');
    expect(input.chatForm.getValues('files')).toEqual([]);
    expect(readChatInputDraft(identity)).toBeUndefined();

    await act(async () => request.reject(new Error('network')));
    expect(input.chatForm.getValues('input')).toBe('spoken input');
    expect(input.chatForm.getValues('files')[0].key).toBe(file.key);
    expect(readChatInputDraft(identity)?.files).toHaveLength(1);
  });

  it('does not restore a submission that already received a partial reply', async () => {
    mocks.start.mockRejectedValueOnce({ responseText: 'partial reply' });
    await render();
    await edit('submitted', [file]);
    await send();
    expect(input.chatForm.getValues('input')).toBe('');
    expect(input.chatForm.getValues('files')).toEqual([]);
    expect(readChatInputDraft(identity)).toBeUndefined();
  });

  it('keeps an independent draft when sending a suggested question', async () => {
    await render();
    await edit('independent draft', [file]);
    await send({ clearInput: false, text: 'suggested question' });
    expect(mocks.start).toHaveBeenCalledOnce();
    expect(input.chatForm.getValues('input')).toBe('independent draft');
    expect(readChatInputDraft(identity)?.text).toBe('independent draft');
  });

  it.each(['resolve', 'reject'] as const)(
    'preserves a pending attachment selected during audio preparation when the submitted request %ss',
    async (outcome) => {
      await render();
      await edit('submitted');
      const audio = Promise.withResolvers<void>();
      mocks.startAudio.mockReturnValueOnce(audio.promise);
      if (outcome === 'reject') mocks.start.mockRejectedValueOnce(new Error('network'));
      await send({ autoTTSResponse: true });
      expect(mocks.start).not.toHaveBeenCalled();

      const pendingFile = {
        id: 'pending-file',
        uploadId: 'pending-upload',
        rawFile: new dom.window.File(['pending'], 'next.pdf'),
        name: 'next.pdf',
        type: 'file' as const,
        status: 0 as const,
        icon: 'icon'
      };
      await act(async () => input.chatForm.setValue('files', [pendingFile]));
      await act(async () => audio.resolve());

      expect(mocks.start).toHaveBeenCalledOnce();
      expect(records.find((item) => item.obj === ChatRoleEnum.Human)?.value).toEqual([
        { text: { content: 'submitted' } }
      ]);
      expect(input.chatForm.getValues('files')).toEqual([pendingFile]);
      expect(readChatInputDraft(identity)?.files).toEqual([]);
      expect(mocks.finishAudio).toHaveBeenCalledOnce();
      expect(mocks.finishStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          status:
            outcome === 'resolve' ? ChatGenerateStatusEnum.done : ChatGenerateStatusEnum.error,
          finishedInActiveChat: true
        })
      );
      expect(records.at(-1)?.status).toBe(ChatStatusEnum.finish);
      if (outcome === 'reject') expect(records.at(-1)?.errorMsg).toBe('network');
    }
  );

  it.each(['resolve', 'reject'] as const)(
    'keeps A generating after leaving for B when the aborted stream %ss',
    async (outcome) => {
      mocks.system.isPc = true;
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
      await edit('A question');
      await send({ text: 'A question', autoTTSResponse: true });
      expect(mocks.notifyStatus).toHaveBeenLastCalledWith(
        ChatGenerateStatusEnum.generating,
        expect.objectContaining({ targetChatId: 'A', hasBeenRead: false })
      );

      await render({ chatId: 'B' });
      await edit('B draft');
      await act(async () =>
        setRecords([
          {
            id: 'B-reply',
            dataId: 'B-reply',
            obj: ChatRoleEnum.AI,
            status: ChatStatusEnum.finish,
            value: [{ text: { content: 'B reply' } }]
          }
        ])
      );
      const currentRecords = records;
      const focus = vi.spyOn(document.querySelector('textarea')!, 'focus');
      await act(async () => generate.abortRequest('leave'));
      await act(async () => vi.advanceTimersByTimeAsync(100));

      expect(mocks.start.mock.calls[0][0].controller.signal.reason.message).toBe('leave');
      expect(mocks.finishStatus).not.toHaveBeenCalled();
      expect(mocks.notifyStatus).toHaveBeenCalledOnce();
      expect(records).toBe(currentRecords);
      expect(input.chatForm.getValues('input')).toBe('B draft');
      expect(readChatInputDraft({ ...identity, chatId: 'B' })?.text).toBe('B draft');
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

  it.each([{ chatId: 'B' }, { tmbId: 'other member' }])(
    'releases prepared audio and preserves both drafts when ownership changes during initialization: %o',
    async (owner) => {
      await render();
      await edit('submitted');
      const audio = Promise.withResolvers<void>();
      mocks.startAudio.mockReturnValueOnce(audio.promise);
      await send({ autoTTSResponse: true });
      await render(owner);
      await edit('new owner draft');
      await act(async () => audio.resolve());
      expect(mocks.start).not.toHaveBeenCalled();
      expect(mocks.finishAudio).toHaveBeenCalledOnce();
      expect(input.chatForm.getValues('input')).toBe('new owner draft');
      expect(readChatInputDraft(identity)?.text).toBe('submitted');
    }
  );
});
