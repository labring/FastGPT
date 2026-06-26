import React, {
  useCallback,
  useRef,
  useState,
  useMemo,
  useImperativeHandle,
  useEffect,
  useLayoutEffect
} from 'react';
import Script from 'next/script';
import { Box, type BoxProps } from '@chakra-ui/react';
import { EventNameEnum, eventBus } from '@/web/common/utils/eventbus';
import { useTranslation } from 'next-i18next';
import type { MarkChatReadBodyType } from '@fastgpt/global/openapi/core/chat/history/api';
import { postStopV2Chat } from '@/web/core/chat/api';
import type { ChatBoxInputType, StopChatFnResult, ChatGenerateStatusChangeHandler } from './type';
import type { StartChatFnProps } from '../type';
import ChatInput from './Input/ChatInput';
import { type OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import {
  ChatGenerateStatusEnum,
  ChatRoleEnum,
  ChatStatusEnum
} from '@fastgpt/global/core/chat/constants';
import { getInteractiveByHistories } from './utils/interactive';
import {
  ChatInputWrapperStyle,
  ChatTypeEnum,
  FeedbackTypeEnum,
  HomeChatContentWrapperStyle
} from './constants';
import ChatProvider, { ChatBoxContext, type ChatProviderProps } from './Provider';
import { WorkflowRuntimeContext } from '../context/workflowRuntimeContext';
import dynamic from 'next/dynamic';
import { type StreamResponseType } from '@/web/common/api/fetch';
import { useContextSelector } from 'use-context-selector';
import { useCreation, useDebounceEffect, useMemoizedFn } from 'ahooks';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { getChatScrollTargetKey, shouldForceScrollAfterRecordsLoaded } from './utils/scrollUtils';
import { isChatRoundPending } from './utils/chatStatus';
import { getProcessedChatRecords } from './utils/recordGroups';
import { useChatInputForm } from './hooks/useChatInputForm';
import { useChatScroll } from './hooks/useChatScroll';
import { useVariableInputVisibility } from './hooks/useVariableInputVisibility';
import { useQuestionGuide } from './hooks/useQuestionGuide';
import { useChatResume } from './hooks/useChatResume';
import { useChatGenerate } from './hooks/useChatGenerate';
import { useChatRecordActions } from './hooks/useChatRecordActions';
import { useChatFeedbackActions } from './hooks/useChatFeedbackActions';
import ChatBoxModals from './components/ChatBoxModals';
import type { ChatRecordsListProps } from './components/ChatRecordsList';
import AppChatMain from './components/AppChatMain';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import ScrollToBottomButton from './components/ScrollToBottomButton';
import { useToast } from '@fastgpt/web/hooks/useToast';
import {
  QuickReplyContextProvider,
  useRegisterQuickReplyClickHandler
} from '../context/quickReplyContext';
import type { ChatTargetInputType } from '@fastgpt/global/openapi/core/chat/api';
import { useChatApiTarget } from '@/web/core/chat/utils';

const ChatHomeVariablesForm = dynamic(() => import('./components/home/ChatHomeVariablesForm'));
const DesktopHomeLayout = dynamic(() => import('./components/home/DesktopHomeLayout'));
const MobileHomeLayout = dynamic(() => import('./components/home/MobileHomeLayout'));
const WorkorderEntrance = dynamic(() => import('@/pageComponents/chat/WorkorderEntrance'));

type Props = OutLinkChatAuthProps &
  ChatProviderProps &
  BoxProps & {
    isReady: boolean;
    features?: ChatBoxFeatures;
    active?: boolean; // can use
    disabledSendTip?: string;

    onStartChat?: (e: StartChatFnProps) => Promise<
      StreamResponseType & {
        isNewChat?: boolean;
      }
    >;
    onTriggerRefresh?: () => void;
    /** 已读标记由外部页面注入，ChatBox 不直接耦合普通 App history 接口。 */
    onMarkChatRead?: (data: MarkChatReadBodyType) => Promise<unknown>;
    /** 生成状态变化只通过 props 通知外部，ChatBox 不直接同步侧栏历史或最近使用。 */
    onChatGenerateStatusChange?: ChatGenerateStatusChangeHandler;
    EmptyState?: React.ReactNode;
    /** 日志详情中展示用户反馈内容时使用的用户显示名。 */
    feedbackUserName?: string;
  };

export type ChatBoxFeatures = {
  feedbackType?: `${FeedbackTypeEnum}`;
  mark?: boolean;
  /** 语音识别输入开关。 */
  voice?: boolean;
  /** AI 回复朗读和自动 TTS 开关。 */
  tts?: boolean;
  /** 输入引导和回答后的推荐问题开关。 */
  inputGuide?: boolean;
  /** AI 回复底部的 sandbox 打开入口开关。 */
  sandbox?: boolean;
  workorder?: boolean;
  autoResume?: boolean;
  markRead?: boolean;
  quickReplies?: boolean;
  disableFooterHoverTranslate?: boolean;
  footerRunDetailPosition?: 'default' | 'afterCopy';
};

const resolveChatBoxFeatures = (
  features?: ChatBoxFeatures
): Required<Omit<ChatBoxFeatures, 'feedbackType'>> & {
  feedbackType: `${FeedbackTypeEnum}`;
} => ({
  feedbackType: features?.feedbackType ?? FeedbackTypeEnum.hidden,
  mark: features?.mark ?? false,
  voice: features?.voice ?? true,
  tts: features?.tts ?? true,
  inputGuide: features?.inputGuide ?? true,
  sandbox: features?.sandbox ?? true,
  workorder: features?.workorder ?? false,
  autoResume: features?.autoResume ?? false,
  markRead: features?.markRead ?? true,
  quickReplies: features?.quickReplies ?? false,
  disableFooterHoverTranslate: features?.disableFooterHoverTranslate ?? false,
  footerRunDetailPosition: features?.footerRunDetailPosition ?? 'default'
});

const ChatBox = ({
  isReady = true,
  features,
  active = true,
  disabledSendTip,
  onStartChat,
  chatType,
  onTriggerRefresh,
  onMarkChatRead,
  onChatGenerateStatusChange,
  boxBodyProps,
  inputBodyProps,
  sourceTarget: _sourceTarget,
  chatId: _chatId,
  outLinkAuthData: _outLinkAuthData,
  InputLeftComponent: _InputLeftComponent,
  dialogTips: _dialogTips,
  wideLogo: _wideLogo,
  squareLogo: _squareLogo,
  slogan: _slogan,
  quickAppList: _quickAppList,
  onSwitchQuickApp: _onSwitchQuickApp,
  EmptyState,
  feedbackUserName,
  ...props
}: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isPc } = useSystem();
  const TextareaDom = useRef<HTMLTextAreaElement>(null);
  const chatController = useRef(new AbortController());
  const questionGuideController = useRef(new AbortController());
  const pluginController = useRef(new AbortController());
  const resumeController = useRef<AbortController>();
  const resumedChatTargetRef = useRef<string>();
  const lastRecordsLoadedScrollTargetRef = useRef<string>();
  const resolvedFeatures = useMemo(() => resolveChatBoxFeatures(features), [features]);

  const [questionGuides, setQuestionGuide] = useState<string[]>([]);
  const [expandedDeletedGroups, setExpandedDeletedGroups] = useState<Set<string>>(new Set());
  const { ScrollContainerRef, scrollToBottom, generatingScroll, isScrollToBottomButtonVisible } =
    useChatScroll();

  const chatBoxData = useContextSelector(ChatItemContext, (v) => v.chatBoxData);
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);
  const ChatBoxRef = useContextSelector(ChatItemContext, (v) => v.ChatBoxRef);
  const setIsVariableVisible = useContextSelector(ChatItemContext, (v) => v.setIsVariableVisible);

  const isLoadingRecords = useContextSelector(ChatRecordContext, (v) => v.isLoadingRecords);
  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const setChatRecords = useContextSelector(ChatRecordContext, (v) => v.setChatRecords);
  const isChatRecordsLoaded = useContextSelector(ChatRecordContext, (v) => v.isChatRecordsLoaded);
  const ScrollData = useContextSelector(ChatRecordContext, (v) => v.ScrollData);
  const itemRefs = useContextSelector(ChatRecordContext, (v) => v.itemRefs);

  const sourceKey = useContextSelector(WorkflowRuntimeContext, (v) => v.sourceKey);
  const appId = useContextSelector(WorkflowRuntimeContext, (v) => v.appId);
  const sourceTarget = useContextSelector(WorkflowRuntimeContext, (v) => v.sourceTarget);
  const chatTarget = useChatApiTarget(sourceTarget);
  const chatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const activeSourceKeyRef = useRef<string | undefined>(sourceKey);
  const activeChatIdRef = useRef<string | undefined>(chatId);
  useLayoutEffect(() => {
    activeSourceKeyRef.current = sourceKey;
    activeChatIdRef.current = chatId;
  }, [sourceKey, chatId]);
  const chatScrollTargetKey = useMemo(
    () => getChatScrollTargetKey({ sourceKey, chatId }),
    [sourceKey, chatId]
  );
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);
  const welcomeText = useContextSelector(ChatBoxContext, (v) => v.welcomeText);
  const variableList = useContextSelector(ChatBoxContext, (v) => v.variableList);
  const questionGuide = useContextSelector(ChatBoxContext, (v) => v.questionGuide);
  const isChatting = useContextSelector(ChatBoxContext, (v) => v.isChatting);
  const isRoundPending = isChatRoundPending({
    isChatting,
    chatGenerateStatus:
      chatBoxData.sourceKey === sourceKey && chatBoxData.chatId === chatId
        ? chatBoxData.chatGenerateStatus
        : undefined,
    lastChat: chatRecords[chatRecords.length - 1]
  });

  const notifyChatGenerateStatusChange = useMemoizedFn(
    (
      status: ChatGenerateStatusEnum,
      options?: {
        hasBeenRead?: boolean;
        targetSourceKey?: string;
        targetChatId?: string;
        title?: string;
      }
    ) => {
      const targetSourceKey = options?.targetSourceKey ?? sourceKey;
      if (targetSourceKey !== sourceKey) return;

      const targetChatId = options?.targetChatId ?? chatId;
      if (!targetChatId) return;

      onChatGenerateStatusChange?.({
        sourceTarget,
        chatId: targetChatId,
        status,
        hasBeenRead: options?.hasBeenRead,
        title: options?.title
      });
    }
  );

  const markChatRead = useMemoizedFn(async (data: MarkChatReadBodyType) => {
    if (!resolvedFeatures.markRead || !onMarkChatRead) return;

    return onMarkChatRead(data);
  });
  const requestStopChat = useMemoizedFn(async (): Promise<StopChatFnResult> => {
    const result = await postStopV2Chat({
      ...chatTarget,
      chatId,
      outLinkAuthData
    });

    return {
      chatGenerateStatus: result.chatGenerateStatus ?? ChatGenerateStatusEnum.done,
      completed: result.completed
    };
  });
  const finishChatGenerateStatus = useMemoizedFn(
    ({
      status,
      finishedInActiveChat,
      targetChatTarget = chatTarget,
      targetSourceKey = sourceKey,
      targetChatId = chatId,
      shouldUpdateChatBoxData
    }: {
      status: ChatGenerateStatusEnum;
      finishedInActiveChat: boolean;
      targetChatTarget?: ChatTargetInputType;
      targetSourceKey?: string;
      targetChatId?: string;
      shouldUpdateChatBoxData?: (state: typeof chatBoxData) => boolean;
    }) => {
      if (!targetSourceKey || !targetChatId) return;

      setChatBoxData((state) =>
        (shouldUpdateChatBoxData?.(state) ??
        (state.sourceKey === targetSourceKey && state.chatId === targetChatId))
          ? {
              ...state,
              chatGenerateStatus: status,
              hasBeenRead: finishedInActiveChat
            }
          : state
      );

      const syncStatus = (hasBeenRead: boolean) => {
        notifyChatGenerateStatusChange(status, {
          targetSourceKey,
          targetChatId,
          hasBeenRead
        });
      };

      if (!finishedInActiveChat) {
        syncStatus(false);
        return;
      }

      void markChatRead({
        ...targetChatTarget,
        chatId: targetChatId,
        ...outLinkAuthData
      })
        .catch(() => {})
        .finally(() => {
          syncStatus(true);
        });
    }
  );

  const resumeTargetAiDataId = useMemo(() => {
    for (let i = chatRecords.length - 1; i >= 0; i--) {
      const row = chatRecords[i];
      if (row.obj === ChatRoleEnum.AI && row.dataId) {
        return row.dataId as string;
      }
    }
    return undefined;
  }, [chatRecords]);

  // Workflow running, there are user input or selection
  const { interactive: lastInteractive, canSendQuery } = useMemo(
    () => getInteractiveByHistories(chatRecords),
    [chatRecords]
  );

  const { chatForm, setValue, chatStarted, chatStartedWatch, resetInputVal } = useChatInputForm({
    sourceKey,
    chatId,
    chatBoxSourceKey: chatBoxData?.sourceKey,
    chatRecordsLength: chatRecords.length,
    chatType,
    variableList,
    TextareaDom
  });
  const createQuestionGuide = useQuestionGuide({
    appId: resolvedFeatures.inputGuide ? appId || '' : '',
    chatId,
    questionGuide,
    outLinkAuthData,
    chatControllerRef: chatController,
    questionGuideControllerRef: questionGuideController,
    setQuestionGuide,
    generatingScroll
  });

  const { abortRequest, generatingMessage, sendPrompt } = useChatGenerate({
    onStartChat,
    isRoundPending,
    chatControllerRef: chatController,
    questionGuideControllerRef: questionGuideController,
    pluginControllerRef: pluginController,
    resumeControllerRef: resumeController,
    resumedChatTargetRef,
    activeSourceKeyRef,
    activeChatIdRef,
    TextareaDom,
    resetInputVal,
    setQuestionGuide,
    createQuestionGuide,
    scrollToBottom,
    generatingScroll,
    notifyChatGenerateStatusChange,
    finishChatGenerateStatus
  });
  const sendPromptWithDisabledGuard = useMemoizedFn((input: ChatBoxInputType) => {
    if (disabledSendTip) {
      toast({
        title: disabledSendTip,
        status: 'warning'
      });
      return;
    }
    sendPrompt(input);
  });

  const handleStopSettled = useMemoizedFn((status: ChatGenerateStatusEnum, completed: boolean) => {
    const nextStatus = completed ? status : ChatGenerateStatusEnum.generating;
    setChatBoxData((state) =>
      state.chatId === chatId && state.sourceKey === sourceKey
        ? {
            ...state,
            chatGenerateStatus: nextStatus,
            hasBeenRead: false
          }
        : state
    );
    notifyChatGenerateStatusChange(nextStatus, { hasBeenRead: false });
  });

  const { isRecordActionLoading, retryInput, editInput } = useChatRecordActions({
    sendPrompt
  });
  const {
    feedbackId,
    setFeedbackId,
    adminMarkData,
    setAdminMarkData,
    likeFeedbackEffect,
    onMark,
    onAddUserLike,
    onAddUserDislike,
    onCloseCustomFeedback,
    onToggleFeedbackReadStatus,
    onFeedbackSuccess,
    onAdminMarkSuccess
  } = useChatFeedbackActions({
    feedbackType: resolvedFeatures.feedbackType,
    enableMark: resolvedFeatures.mark,
    chatType,
    onTriggerRefresh
  });

  const statusBoxData = useCreation(() => {
    if (!isChatting) return;
    const chatContent = chatRecords[chatRecords.length - 1];
    if (!chatContent) return;

    return {
      status: chatContent.status || ChatStatusEnum.loading,
      name: t(chatContent.moduleName || ('' as any)) || t('common:Loading')
    };
  }, [chatRecords, isChatting, t]);

  // page change and abort request
  useEffect(() => {
    // Reset local UI state when switching chats.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on chat switch
    setQuestionGuide([]);
    setValue('chatStarted', false);
    resumedChatTargetRef.current = undefined;
    // abortRequest('leave');

    return () => {
      abortRequest('leave');
    };
  }, [chatId, sourceKey, abortRequest, setValue]);

  useEffect(() => {
    if (
      !shouldForceScrollAfterRecordsLoaded({
        isChatRecordsLoaded,
        targetKey: chatScrollTargetKey,
        lastScrolledTargetKey: lastRecordsLoadedScrollTargetRef.current
      })
    ) {
      return;
    }

    lastRecordsLoadedScrollTargetRef.current = chatScrollTargetKey;
    scrollToBottom('auto');
  }, [chatScrollTargetKey, isChatRecordsLoaded, scrollToBottom]);

  useChatResume({
    enableAutoResume: resolvedFeatures.autoResume,
    isReady,
    resumeTargetAiDataId,
    activeSourceKeyRef,
    activeChatIdRef,
    resumedChatTargetRef,
    resumeControllerRef: resumeController,
    generatingMessage,
    scrollToBottom,
    finishChatGenerateStatus
  });

  const canRenderChatInput = onStartChat && chatStarted && active && canSendQuery;
  const canSendPrompt = canRenderChatInput && !isRoundPending;
  const canRenderScrollToBottomButton =
    (chatType === ChatTypeEnum.chat ||
      chatType === ChatTypeEnum.home ||
      chatType === ChatTypeEnum.test ||
      chatType === ChatTypeEnum.share) &&
    isScrollToBottomButtonVisible;

  // Add listener
  useEffect(() => {
    const windowMessage = ({ data }: MessageEvent<{ type: 'sendPrompt'; text: string }>) => {
      if (data?.type === 'sendPrompt' && data?.text) {
        sendPrompt({
          text: data.text,
          interactive: lastInteractive
        });
      }
    };
    window.addEventListener('message', windowMessage);

    const fn = ({ focus = false, ...e }: ChatBoxInputType & { focus?: boolean }) => {
      if (canSendPrompt || focus) {
        sendPrompt({
          ...e,
          interactive: lastInteractive
        });
      }
    };
    eventBus.on(EventNameEnum.sendQuestion, fn);
    eventBus.on(EventNameEnum.editQuestion, ({ text }: { text: string }) => {
      if (!text) return;
      resetInputVal({ text });
    });

    return () => {
      window.removeEventListener('message', windowMessage);
      eventBus.off(EventNameEnum.sendQuestion);
      eventBus.off(EventNameEnum.editQuestion);
    };
  }, [isReady, resetInputVal, sendPrompt, canSendPrompt, lastInteractive]);

  /** 快捷回复点击：直接发送选项文本，并保留输入框原有内容。 */
  const handleQuickReplyClick = useMemoizedFn((text: string) => {
    const trimmedText = text.trim();
    if (!trimmedText) return;

    sendPromptWithDisabledGuard({
      text: trimmedText,
      interactive: lastInteractive,
      clearInput: false
    });
  });

  useRegisterQuickReplyClickHandler(
    resolvedFeatures.quickReplies ? handleQuickReplyClick : undefined
  );

  // Auto send prompt
  useDebounceEffect(
    () => {
      if (
        isReady &&
        chatBoxData?.app?.chatConfig?.autoExecute?.open &&
        chatStarted &&
        chatRecords.length === 0 &&
        isChatRecordsLoaded
      ) {
        sendPrompt({
          text: chatBoxData?.app?.chatConfig?.autoExecute?.defaultPrompt || 'AUTO_EXECUTE',
          hideInUI: true,
          interactive: lastInteractive
        });
      }
    },
    [
      isReady,
      chatStarted,
      chatRecords.length,
      isChatRecordsLoaded,
      sendPrompt,
      chatBoxData?.app?.chatConfig?.autoExecute
    ],
    {
      wait: 1000
    }
  );

  // output data
  useImperativeHandle(ChatBoxRef, () => ({
    restartChat() {
      abortRequest();

      setChatRecords([]);
      setValue('chatStarted', false);
    },
    scrollToBottom(behavior = 'auto') {
      scrollToBottom(behavior, 500);
    }
  }));

  useVariableInputVisibility({ ScrollContainerRef, setIsVariableVisible });

  // Home chat, and no chat records
  const isHomeRender = useMemo(() => {
    return chatType === ChatTypeEnum.home && chatRecords.length === 0 && !chatStartedWatch;
  }, [chatType, chatRecords.length, chatStartedWatch]);

  const toggleDeletedGroup = useCallback((dataIds: string[]) => {
    setExpandedDeletedGroups((prev) => {
      const newSet = new Set(prev);
      // Check if all dataIds are in the set
      const allExpanded = dataIds.every((id) => newSet.has(id));

      if (allExpanded) {
        // Collapse: remove all dataIds
        dataIds.forEach((id) => newSet.delete(id));
      } else {
        // Expand: add all dataIds
        dataIds.forEach((id) => newSet.add(id));
      }

      return newSet;
    });
  }, []);

  // 预处理聊天记录：Log 模式下扩展 chatRecords，添加折叠信息
  const processedRecords = useMemoEnhance(
    () => getProcessedChatRecords({ chatType, chatRecords, expandedDeletedGroups }),
    [chatType, chatRecords, expandedDeletedGroups]
  );
  const recordsListProps: ChatRecordsListProps = useMemo(
    () => ({
      records: processedRecords,
      expandedDeletedGroups,
      itemRefs,
      enableTTS: resolvedFeatures.tts,
      enableMark: resolvedFeatures.mark,
      enableSandbox: resolvedFeatures.sandbox,
      statusBoxData,
      questionGuides,
      onToggleDeletedGroup: toggleDeletedGroup,
      onRetry: retryInput,
      onEdit: editInput,
      onMark,
      onAddUserLike,
      onAddUserDislike,
      likeFeedbackEffect,
      disableFooterHoverTranslate: resolvedFeatures.disableFooterHoverTranslate,
      footerRunDetailPosition: resolvedFeatures.footerRunDetailPosition,
      feedbackUserName,
      onCloseCustomFeedback,
      onToggleFeedbackReadStatus
    }),
    [
      processedRecords,
      expandedDeletedGroups,
      itemRefs,
      resolvedFeatures.voice,
      resolvedFeatures.tts,
      resolvedFeatures.mark,
      resolvedFeatures.sandbox,
      statusBoxData,
      questionGuides,
      toggleDeletedGroup,
      retryInput,
      editInput,
      onMark,
      onAddUserLike,
      onAddUserDislike,
      likeFeedbackEffect,
      resolvedFeatures.disableFooterHoverTranslate,
      resolvedFeatures.footerRunDetailPosition,
      feedbackUserName,
      onCloseCustomFeedback,
      onToggleFeedbackReadStatus
    ]
  );
  const HomeChatInput = (
    <>
      {variableList.filter((item) => item.type !== VariableInputEnum.internal).length > 0 ? (
        <Box w={'100%'}>
          <ChatHomeVariablesForm chatForm={chatForm} />
        </Box>
      ) : (
        <ChatInput
          onSendMessage={sendPromptWithDisabledGuard}
          onStopChat={requestStopChat}
          onStopSettled={handleStopSettled}
          enableInputGuide={resolvedFeatures.inputGuide}
          enableVoiceInput={resolvedFeatures.voice}
          disableSend={isRoundPending || (!isReady && !disabledSendTip)}
          TextareaDom={TextareaDom}
          resetInputVal={resetInputVal}
          chatForm={chatForm}
        />
      )}
    </>
  );

  return (
    <MyBox
      isLoading={isRecordActionLoading}
      display={'flex'}
      flexDirection={'column'}
      h={'100%'}
      position={'relative'}
      {...props}
    >
      <Script src={getWebReqUrl('/js/html2pdf.bundle.min.js')} strategy="lazyOnload"></Script>
      {/* chat box container */}
      {isHomeRender ? (
        <MyBox
          isLoading={isLoadingRecords}
          display="flex"
          flexDirection="column"
          flex={'1 0 0'}
          h={0}
          {...HomeChatContentWrapperStyle}
        >
          {isPc ? (
            <DesktopHomeLayout inputSlot={HomeChatInput} />
          ) : (
            <MobileHomeLayout inputSlot={HomeChatInput} />
          )}
        </MyBox>
      ) : (
        <>
          <AppChatMain
            ScrollData={ScrollData}
            ScrollContainerRef={ScrollContainerRef}
            welcomeText={welcomeText}
            chatStarted={chatStarted}
            chatForm={chatForm}
            chatType={chatType}
            recordsListProps={recordsListProps}
            maxW={props.maxW}
            boxBodyProps={boxBodyProps}
            EmptyState={
              chatRecords.length === 0 && isChatRecordsLoaded && !isLoadingRecords
                ? EmptyState
                : undefined
            }
          />
          {canRenderChatInput && (
            <Box {...ChatInputWrapperStyle} {...inputBodyProps}>
              {resolvedFeatures.workorder && <WorkorderEntrance />}
              <Box position="relative">
                <ScrollToBottomButton
                  isVisible={canRenderScrollToBottomButton}
                  onClick={() => scrollToBottom('smooth')}
                />

                <ChatInput
                  onSendMessage={sendPromptWithDisabledGuard}
                  lastInteractive={lastInteractive}
                  onStopChat={requestStopChat}
                  onStopSettled={handleStopSettled}
                  enableInputGuide={resolvedFeatures.inputGuide}
                  enableVoiceInput={resolvedFeatures.voice}
                  disableSend={isRoundPending}
                  TextareaDom={TextareaDom}
                  resetInputVal={resetInputVal}
                  chatForm={chatForm}
                />
              </Box>
            </Box>
          )}
        </>
      )}

      <ChatBoxModals
        chatId={chatId}
        feedbackId={feedbackId}
        adminMarkData={adminMarkData}
        onCloseFeedback={() => setFeedbackId(undefined)}
        onFeedbackSuccess={onFeedbackSuccess}
        onCloseAdminMark={() => setAdminMarkData(undefined)}
        onAdminMarkChange={setAdminMarkData}
        onAdminMarkSuccess={onAdminMarkSuccess}
      />
    </MyBox>
  );
};
const ChatBoxContainer = (props: Props) => {
  const resolvedFeatures = resolveChatBoxFeatures(props.features);

  return (
    <ChatProvider {...props} enableTTS={resolvedFeatures.tts}>
      <QuickReplyContextProvider enableQuickReplies={resolvedFeatures.quickReplies}>
        <ChatBox {...props} />
      </QuickReplyContextProvider>
    </ChatProvider>
  );
};

export default React.memo(ChatBoxContainer);
