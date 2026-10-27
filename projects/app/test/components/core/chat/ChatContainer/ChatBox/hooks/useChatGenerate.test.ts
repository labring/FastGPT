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
import { useChatResume } from '@/components/core/chat/ChatContainer/ChatBox/hooks/useChatResume';
import { useChatRecordActions } from '@/components/core/chat/ChatContainer/ChatBox/hooks/useChatRecordActions';
import { getInteractiveByHistories } from '@/components/core/chat/ChatContainer/ChatBox/utils/interactive';
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
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { UserChatSelectType } from '@fastgpt/global/core/chat/input/type';
import { AuxiliaryGenerationEventEnum } from '@fastgpt/global/core/ai/auxiliaryGeneration/constants';
import { ChatAgentConfigFormDataSchema } from '@fastgpt/global/core/ai/auxiliaryGeneration/type';
import type { generatingMessageProps } from '@/components/core/chat/ChatContainer/type';
import type { streamResumeFetch } from '@/web/common/api/fetch';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  resume: vi.fn(),
  onGeneratingMessage: vi.fn(),
  applyConfig: vi.fn(),
  toast: vi.fn(),
  startAudio: vi.fn(),
  finishAudio: vi.fn(),
  notifyStatus: vi.fn(),
  finishStatus: vi.fn(),
  createGuide: vi.fn(),
  splitAudio: vi.fn(),
  scroll: vi.fn(),
  deleteRecords: vi.fn(),
  getRecords: vi.fn(),
  refreshRecords: vi.fn(),
  system: { isPc: false }
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@fastgpt/web/hooks/useSystem', () => ({ useSystem: () => mocks.system }));
vi.mock('@/web/common/api/fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/web/common/api/fetch')>()),
  streamResumeFetch: mocks.resume
}));
vi.mock('@/web/core/chat/record/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/web/core/chat/record/api')>()),
  delChatRecordById: mocks.deleteRecords,
  getChatRecords: mocks.getRecords
}));
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
  let recordActions: ReturnType<typeof useChatRecordActions>;
  let records: ChatSiteItemType[];
  let setRecords: React.Dispatch<React.SetStateAction<ChatSiteItemType[]>>;

  const Harness = ({
    chatId,
    pending,
    tmbId,
    withComposer,
    resume
  }: {
    chatId: string;
    pending: boolean;
    tmbId: string;
    withComposer: boolean;
    resume: boolean;
  }) => {
    const textarea = useRef<HTMLTextAreaElement>(null);
    const activeSource = useRef<string | undefined>(sourceKey);
    const activeChat = useRef<string | undefined>(chatId);
    const resumeController = useRef<AbortController>();
    const resumedChatTarget = useRef<string>();
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
      onGeneratingMessage: mocks.onGeneratingMessage,
      isRoundPending: pending,
      chatControllerRef: useRef(new AbortController()),
      questionGuideControllerRef: useRef(new AbortController()),
      pluginControllerRef: useRef(new AbortController()),
      resumeControllerRef: resumeController,
      resumedChatTargetRef: resumedChatTarget,
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
    useChatResume({
      enableAutoResume: resume,
      isReady: true,
      resumeTargetAiDataId: records.at(-1)?.dataId,
      activeSourceKeyRef: activeSource,
      activeChatIdRef: activeChat,
      resumedChatTargetRef: resumedChatTarget,
      resumeControllerRef: resumeController,
      generatingMessage: generate.generatingMessage,
      flushGeneratingMessages: generate.flushGeneratingMessages,
      scrollToBottom: mocks.scroll,
      finishChatGenerateStatus: mocks.finishStatus
    });
    recordActions = useChatRecordActions({ sendPrompt: generate.sendPrompt });
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
    withComposer,
    resume
  }: {
    chatId: string;
    required: boolean;
    pending: boolean;
    tmbId: string;
    withComposer: boolean;
    resume: boolean;
  }) => {
    const variablesForm = useForm<ChatBoxInputFormType>({
      defaultValues: { input: '', files: [], chatStarted: false, variables: { required: '' } }
    });
    variablesForm.register('variables.required', { required });
    const [chatRecords, setChatRecords] = useState<ChatSiteItemType[]>(
      resume
        ? [
            {
              id: 'resumed-ai',
              dataId: 'resumed-ai',
              obj: ChatRoleEnum.AI,
              status: ChatStatusEnum.loading,
              value: []
            }
          ]
        : []
    );
    records = chatRecords;
    setRecords = setChatRecords;
    const [chatBoxData, setChatBoxData] = useState({
      appId: 'app',
      sourceKey,
      chatId,
      chatGenerateStatus: resume ? ChatGenerateStatusEnum.generating : undefined,
      app: { name: 'App' }
    });
    const runtime: React.ComponentProps<typeof WorkflowRuntimeContext.Provider>['value'] = {
      sourceTarget: { sourceType: ChatSourceTypeEnum.app, sourceId: 'app' },
      sourceKey,
      chatId,
      outLinkAuthData: undefined,
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
    const record = {
      chatRecords,
      setChatRecords,
      isChatRecordsLoaded: true,
      refreshChatRecords: async () => {
        const history = await mocks.refreshRecords();
        setChatRecords(history);
        return history;
      }
    } as unknown as React.ComponentProps<typeof ChatRecordContext.Provider>['value'];
    const chat = {
      isChatting: false,
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
            children: React.createElement(Harness, { chatId, pending, tmbId, withComposer, resume })
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
    withComposer = false,
    resume = false
  } = {}) =>
    act(async () =>
      root.render(
        React.createElement(Wrapper, { chatId, required, pending, tmbId, withComposer, resume })
      )
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
    mocks.resume.mockResolvedValue({ responseText: '' });
    mocks.onGeneratingMessage.mockImplementation((message: generatingMessageProps) => {
      if (message.event === AuxiliaryGenerationEventEnum.chatAgentConfig && message.formData) {
        mocks.applyConfig(message.formData);
      }
    });
    mocks.deleteRecords.mockResolvedValue(undefined);
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

  it.each(['normal', 'resume'] as const)(
    'applies generated agent configuration once through the %s stream',
    async (mode) => {
      const formData = ChatAgentConfigFormDataSchema.parse({
        systemPrompt: 'Use the generated agent',
        tools: [{ id: 'systemTool-shared', source: 'system' }]
      });
      const chatAgentBuilderVersion = {
        s3Key: 'chat/helper/config.json',
        expiresAt: '2099-01-01T00:00:00.000Z'
      };
      const event = {
        event: AuxiliaryGenerationEventEnum.chatAgentConfig,
        formData,
        chatAgentBuilderVersion
      };
      mocks.start.mockImplementation(async ({ generatingMessage }) => {
        generatingMessage(event);
        return { responseText: '' };
      });
      mocks.resume.mockImplementation(
        async ({ onmessage }: Parameters<typeof streamResumeFetch>[0]) => {
          onmessage(event);
          return { responseText: '' };
        }
      );

      await render({ resume: mode === 'resume' });
      if (mode === 'normal') await send();

      expect(mocks.applyConfig).toHaveBeenCalledExactlyOnceWith(formData);
      expect(mocks.onGeneratingMessage).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining(event)
      );
      expect(records.at(-1)?.value).toEqual(expect.arrayContaining([{ chatAgentBuilderVersion }]));
      expect(mode === 'resume' ? mocks.resume : mocks.start).toHaveBeenCalledOnce();
      expect(mode === 'resume' ? mocks.start : mocks.resume).not.toHaveBeenCalled();
    }
  );

  it('retains a completed configuration reference after reopening without replaying or auto-applying', async () => {
    const chatAgentBuilderVersion = {
      s3Key: 'chat/helper/completed.json',
      expiresAt: '2099-01-01T00:00:00.000Z'
    };
    mocks.resume.mockResolvedValue({
      responseText: '',
      completedChat: {
        chatGenerateStatus: ChatGenerateStatusEnum.done,
        records: {
          list: [
            {
              id: 'resumed-ai',
              dataId: 'resumed-ai',
              obj: ChatRoleEnum.AI,
              value: [{ chatAgentBuilderVersion }]
            }
          ]
        }
      }
    });
    await render({ resume: true });
    expect(records.at(-1)?.value).toEqual([{ chatAgentBuilderVersion }]);
    expect(mocks.applyConfig).not.toHaveBeenCalled();
  });

  it.each(
    (['agentAsk', 'confirm', 'revise', 'cancel'] as const).flatMap((action) => [
      { action, paginated: false },
      { action, paginated: true }
    ])
  )(
    'creates and retries a structured user reply for $action (paginated: $paginated)',
    async ({ action, paginated }) => {
      const runtime = { entryNodeIds: [], memoryEdges: [], nodeOutputs: [] };
      const select: UserChatSelectType =
        action === 'agentAsk'
          ? {
              type: 'agentAsk',
              questions: [
                { question: 'Choose?', value: 'upload' },
                { question: 'Details?', value: 'Custom feedback' },
                { question: 'Optional?', value: '' }
              ]
            }
          : {
              type: 'workflowBuilderPreview',
              questions: [
                {
                  question: 'Confirm workflow?',
                  value:
                    action === 'revise'
                      ? 'Add a review branch'
                      : action === 'confirm'
                        ? 'Confirm'
                        : 'Cancel'
                }
              ]
            };
      const interactive: WorkflowInteractiveResponseType =
        action === 'agentAsk'
          ? {
              ...runtime,
              type: 'agentAsk',
              askId: 'ask-1',
              params: {
                description: '',
                questions: select.questions.map(({ question }) => ({
                  question,
                  options: [
                    { summary: 'Upload file', value: 'upload' },
                    { summary: 'Paste text', value: 'paste' }
                  ]
                }))
              }
            }
          : {
              ...runtime,
              type: 'workflowBuilderPreview',
              previewId: 'preview-1',
              params: {
                title: 'Confirm workflow?',
                mermaid: 'flowchart LR; A --> B',
                sections: [],
                actions: [
                  { value: 'confirm', label: 'Confirm', inputMode: 'none' },
                  { value: 'revise', label: 'Revise', inputMode: 'text' },
                  { value: 'cancel', label: 'Cancel', inputMode: 'none' }
                ]
              }
            };
      const request = Promise.withResolvers<{ responseText: string }>();
      mocks.start.mockReturnValueOnce(request.promise);
      await render();
      const sourceAi: ChatSiteItemType = {
        id: 'previous-ai',
        dataId: 'previous-ai',
        obj: ChatRoleEnum.AI,
        status: ChatStatusEnum.finish,
        value: [{ interactive }]
      };
      const originalAi = structuredClone(sourceAi);
      await act(async () => setRecords([sourceAi]));
      await act(async () => generate.sendPrompt({ select, interactive }));
      expect(records.map(({ obj }) => obj)).toEqual([
        ChatRoleEnum.AI,
        ChatRoleEnum.Human,
        ChatRoleEnum.AI
      ]);
      const [, user, ai] = records;
      expect(records[0]).toEqual(originalAi);
      expect(user.value).toEqual([{ select }]);
      expect(user.hideInUI).toBe(false);
      expect(ai.dataId).not.toBe('previous-ai');
      expect(
        mocks.start.mock.calls[0][0].messages.filter(
          (message: { role: string }) => message.role === 'user'
        )
      ).toEqual([expect.objectContaining({ content: [{ type: 'select', select }] })]);
      await act(async () => request.resolve({ responseText: 'Continued' }));
      mocks.refreshRecords.mockResolvedValueOnce([sourceAi]);
      if (paginated) await act(async () => setRecords(records.slice(1)));
      await act(async () => recordActions.retryInput(user.dataId)?.());
      expect(mocks.getRecords).not.toHaveBeenCalled();
      expect(mocks.deleteRecords).toHaveBeenCalledTimes(1);
      expect(mocks.deleteRecords.mock.calls[0][0]).not.toHaveProperty('retry');
      expect(mocks.refreshRecords).toHaveBeenCalledTimes(1);
      expect(mocks.refreshRecords.mock.invocationCallOrder[0]).toBeGreaterThan(
        mocks.deleteRecords.mock.invocationCallOrder[0]
      );
      const retried = records.at(-2);
      expect(retried?.value).toEqual(user.value);
      expect(retried?.dataId).not.toBe(user.dataId);
      expect(mocks.start).toHaveBeenCalledTimes(2);
      expect(
        mocks.start.mock.calls[1][0].messages
          .filter((message: { role: string }) => message.role === 'user')
          .at(-1)
      ).toMatchObject({ content: [{ type: 'select', select }] });
      if (!paginated && retried) {
        await act(async () => recordActions.delOneMessage(retried.dataId)());
        expect(records).toEqual([originalAi]);
        expect(getInteractiveByHistories(records)).toEqual({
          interactive,
          canSendQuery: action === 'agentAsk'
        });
      }
    }
  );

  it('keeps the original structured input when retry deletion fails', async () => {
    await render();
    await act(async () =>
      setRecords([
        {
          id: 'answer-user',
          dataId: 'answer-user',
          obj: ChatRoleEnum.Human,
          status: ChatStatusEnum.finish,
          value: [
            {
              select: {
                type: 'agentAsk',
                questions: [{ question: 'Choose?', value: 'A' }]
              }
            }
          ]
        }
      ])
    );
    const original = records;
    mocks.deleteRecords.mockRejectedValueOnce(new Error('Delete failed'));
    await act(async () => recordActions.retryInput('answer-user')?.());
    expect(records).toBe(original);
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.refreshRecords).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'warning', title: 'Delete failed' })
    );
  });

  it.each(['agentAsk', 'workflowBuilderPreview'] as const)(
    'does not offer editing for a structured %s user reply',
    async (type) => {
      await render();
      await act(async () =>
        setRecords([
          {
            id: 'answer-user',
            dataId: 'answer-user',
            obj: ChatRoleEnum.Human,
            status: ChatStatusEnum.finish,
            value: [
              {
                select: {
                  type,
                  questions: [{ question: 'Choose?', value: 'confirm' }]
                }
              }
            ]
          }
        ])
      );
      const original = records;

      expect(recordActions.editInput('answer-user')).toBeUndefined();
      expect(records).toBe(original);
      expect(recordActions.isRecordActionLoading).toBe(false);
      expect(mocks.deleteRecords).not.toHaveBeenCalled();
      expect(mocks.refreshRecords).not.toHaveBeenCalled();
      expect(mocks.start).not.toHaveBeenCalled();
    }
  );

  it.each([true, false])(
    'reloads the history window before sending an edited message (refresh succeeds: %s)',
    async (succeeds) => {
      await render();
      await act(async () =>
        setRecords([
          {
            id: 'old-user',
            dataId: 'old-user',
            obj: ChatRoleEnum.Human,
            status: ChatStatusEnum.finish,
            value: [{ text: { content: 'Old prompt' } }]
          }
        ])
      );
      if (succeeds) mocks.refreshRecords.mockResolvedValueOnce([]);
      else mocks.refreshRecords.mockRejectedValueOnce(new Error('Refresh failed'));

      await act(async () =>
        recordActions.editInput('old-user')?.({ text: 'Edited prompt', files: [] })
      );

      expect(mocks.deleteRecords).toHaveBeenCalledTimes(1);
      expect(mocks.refreshRecords).toHaveBeenCalledTimes(1);
      expect(mocks.refreshRecords.mock.invocationCallOrder[0]).toBeGreaterThan(
        mocks.deleteRecords.mock.invocationCallOrder[0]
      );
      expect(recordActions.isRecordActionLoading).toBe(false);
      if (succeeds) {
        expect(mocks.start).toHaveBeenCalledTimes(1);
        expect(mocks.start.mock.calls[0][0].messages).toEqual([
          expect.objectContaining({ role: 'user', content: 'Edited prompt' })
        ]);
      } else {
        expect(mocks.start).not.toHaveBeenCalled();
        expect(mocks.toast).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'warning', title: 'Refresh failed' })
        );
      }
    }
  );

  it('finishes a tool activity when its completion signal contains an empty response', async () => {
    const request = Promise.withResolvers<{ responseText: string }>();
    mocks.start.mockReturnValueOnce(request.promise);
    await render();
    await send();

    const tool = {
      id: 'skill-reference',
      toolName: 'Read file',
      toolAvatar: '',
      functionName: 'sandbox_read_file',
      params: '',
      hideDetails: true
    };
    const getActivity = () => {
      const response = records.at(-1);
      return response?.obj === ChatRoleEnum.AI ? response.value.at(-1)?.tools?.[0] : undefined;
    };
    await act(async () =>
      generate.generatingMessage({
        event: SseResponseEventEnum.toolCall,
        responseValueId: tool.id,
        tool
      })
    );
    expect(getActivity()?.response).toBeUndefined();

    await act(async () =>
      generate.generatingMessage({
        event: SseResponseEventEnum.toolResponse,
        responseValueId: tool.id,
        tool: { ...tool, response: '' }
      })
    );
    expect(getActivity()).toEqual({ ...tool, response: '' });
    await act(async () => request.resolve({ responseText: '' }));
  });

  it('ignores orphan tool deltas and merges later results by tool ID without touching other values', async () => {
    const request = Promise.withResolvers<{ responseText: string }>();
    mocks.start.mockReturnValueOnce(request.promise);
    await render();
    await send();
    const tool = {
      id: 'resumed-tool',
      toolName: 'Plan preview',
      toolAvatar: '',
      functionName: 'ask_user',
      params: ''
    };
    // 刷新恢复或新交互轮次可能只有数据库预创建的空 AI 占位。
    await act(async () =>
      setRecords((state) =>
        state.map((item) => (item.obj === ChatRoleEnum.AI ? { ...item, value: [] } : item))
      )
    );

    for (const event of [
      SseResponseEventEnum.toolParams,
      SseResponseEventEnum.toolResponse
    ] as const) {
      await act(async () =>
        generate.generatingMessage({
          event,
          tool: { ...tool, params: 'orphan', response: 'orphan' }
        })
      );
    }
    expect(records.at(-1)?.value).toEqual([]);

    await act(async () =>
      generate.generatingMessage({ event: SseResponseEventEnum.toolCall, tool })
    );
    await act(async () =>
      generate.generatingMessage({
        event: SseResponseEventEnum.answer,
        responseValueId: 'answer-after-tool',
        text: 'Keep this answer'
      })
    );
    await act(async () =>
      generate.generatingMessage({
        event: SseResponseEventEnum.toolParams,
        responseValueId: 'unrelated-value',
        tool: { ...tool, params: '{}' }
      })
    );
    await act(async () =>
      generate.generatingMessage({
        event: SseResponseEventEnum.toolResponse,
        responseValueId: 'unrelated-value',
        tool: { ...tool, response: 'confirmed' }
      })
    );

    const response = records.at(-1);
    expect(response?.obj).toBe(ChatRoleEnum.AI);
    if (response?.obj !== ChatRoleEnum.AI) throw new Error('Expected AI response');
    expect(response.value).toEqual([
      { id: tool.id, tools: [{ ...tool, params: '{}', response: 'confirmed' }] },
      { id: 'answer-after-tool', text: { content: 'Keep this answer' } }
    ]);
    await act(async () => request.resolve({ responseText: '' }));
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
