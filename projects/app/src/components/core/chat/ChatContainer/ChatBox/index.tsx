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
import { Box, Flex } from '@chakra-ui/react';
import { EventNameEnum, eventBus } from '@/web/common/utils/eventbus';
import { useTranslation } from 'next-i18next';
import { postMarkChatRead } from '@/web/core/chat/history/api';
import type { MarkChatReadBodyType } from '@fastgpt/global/openapi/core/chat/history/api';
import { postStopV2Chat } from '@/web/core/chat/api';
import type { ChatBoxInputType, StopChatFnResult } from './type';
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
import { useSidebarChatGenerateStatus } from './hooks/useSidebarChatGenerateStatus';
import { useChatResume } from './hooks/useChatResume';
import { useChatGenerate } from './hooks/useChatGenerate';
import { useChatRecordActions } from './hooks/useChatRecordActions';
import { useChatFeedbackActions } from './hooks/useChatFeedbackActions';
import ChatBoxModals from './components/ChatBoxModals';
import type { ChatRecordsListProps } from './components/ChatRecordsList';
import AppChatMain from './components/AppChatMain';
import { useSystem } from '@fastgpt/web/hooks/useSystem';

const ChatHomeVariablesForm = dynamic(() => import('./components/home/ChatHomeVariablesForm'));
const DesktopHomeLayout = dynamic(() => import('./components/home/DesktopHomeLayout'));
const MobileHomeLayout = dynamic(() => import('./components/home/MobileHomeLayout'));
const WorkorderEntrance = dynamic(() => import('@/pageComponents/chat/WorkorderEntrance'));

type Props = OutLinkChatAuthProps &
  ChatProviderProps & {
    isReady: boolean;
    feedbackType?: `${FeedbackTypeEnum}`;
    showMarkIcon?: boolean; // admin mark dataset
    showVoiceIcon?: boolean;
    active?: boolean; // can use
    showWorkorder?: boolean;
    enableAutoResume?: boolean;
    /** 是否执行普通 App Chat 的已读标记；Skill 调试会话没有普通 Chat history，需要关闭。 */
    enableMarkChatRead?: boolean;

    onStartChat?: (e: StartChatFnProps) => Promise<
      StreamResponseType & {
        isNewChat?: boolean;
      }
    >;
    onTriggerRefresh?: () => void;
    /** 覆盖默认消息删除接口；Skill 调试会话需要走 skill 专属 chat item 删除接口。 */
    onDeleteChatItem?: (contentId: string, delFile?: boolean) => Promise<void>;
    /** 覆盖默认停止对话接口；Skill 调试会话不能走普通 App Chat 的 /v2/chat/stop 鉴权。 */
    onStopChat?: () => Promise<StopChatFnResult>;
    /** 覆盖默认已读接口；不传则使用普通 App Chat 的 postMarkChatRead。 */
    onMarkChatRead?: (data: MarkChatReadBodyType) => Promise<unknown>;
  };

const ChatBox = ({
  isReady = true,
  feedbackType = FeedbackTypeEnum.hidden,
  showMarkIcon = false,
  showVoiceIcon = true,
  active = true,
  showWorkorder,
  enableAutoResume = false,
  enableMarkChatRead = true,
  onStartChat,
  chatType,
  onTriggerRefresh,
  onDeleteChatItem,
  onStopChat,
  onMarkChatRead
}: Props) => {
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const TextareaDom = useRef<HTMLTextAreaElement>(null);
  const chatController = useRef(new AbortController());
  const questionGuideController = useRef(new AbortController());
  const pluginController = useRef(new AbortController());
  const resumeController = useRef<AbortController>();
  const resumedChatTargetRef = useRef<string>();
  const lastRecordsLoadedScrollTargetRef = useRef<string>();

  const [questionGuides, setQuestionGuide] = useState<string[]>([]);
  const [expandedDeletedGroups, setExpandedDeletedGroups] = useState<Set<string>>(new Set());
  const { ScrollContainerRef, scrollToBottom, generatingScroll } = useChatScroll();

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

  const appId = useContextSelector(WorkflowRuntimeContext, (v) => v.appId);
  const chatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const activeAppIdRef = useRef<string | undefined>(appId);
  const activeChatIdRef = useRef<string | undefined>(chatId);
  useLayoutEffect(() => {
    activeAppIdRef.current = appId;
    activeChatIdRef.current = chatId;
  }, [appId, chatId]);
  const chatScrollTargetKey = useMemo(
    () => getChatScrollTargetKey({ appId, chatId }),
    [appId, chatId]
  );
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);
  const welcomeText = useContextSelector(ChatBoxContext, (v) => v.welcomeText);
  const variableList = useContextSelector(ChatBoxContext, (v) => v.variableList);
  const questionGuide = useContextSelector(ChatBoxContext, (v) => v.questionGuide);
  const isChatting = useContextSelector(ChatBoxContext, (v) => v.isChatting);
  const isRoundPending = isChatRoundPending({
    isChatting,
    chatGenerateStatus:
      chatBoxData.appId === appId && chatBoxData.chatId === chatId
        ? chatBoxData.chatGenerateStatus
        : undefined,
    lastChat: chatRecords[chatRecords.length - 1]
  });

  const syncSidebarChatGenerateStatus = useSidebarChatGenerateStatus();

  const markChatRead = useMemoizedFn(async (data: MarkChatReadBodyType) => {
    if (!enableMarkChatRead) return;

    return onMarkChatRead?.(data) ?? postMarkChatRead(data);
  });
  const requestStopChat = useMemoizedFn(async (): Promise<StopChatFnResult> => {
    if (onStopChat) {
      return onStopChat();
    }

    const result = await postStopV2Chat({
      appId,
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
      targetAppId = appId,
      targetChatId = chatId,
      shouldUpdateChatBoxData
    }: {
      status: ChatGenerateStatusEnum;
      finishedInActiveChat: boolean;
      targetAppId?: string;
      targetChatId?: string;
      shouldUpdateChatBoxData?: (state: typeof chatBoxData) => boolean;
    }) => {
      if (!targetAppId || !targetChatId) return;

      setChatBoxData((state) =>
        (shouldUpdateChatBoxData?.(state) ??
        (state.appId === targetAppId && state.chatId === targetChatId))
          ? {
              ...state,
              chatGenerateStatus: status,
              hasBeenRead: finishedInActiveChat
            }
          : state
      );

      const syncStatus = (hasBeenRead: boolean) => {
        syncSidebarChatGenerateStatus(status, {
          targetAppId,
          targetChatId,
          hasBeenRead
        });
      };

      if (!finishedInActiveChat) {
        syncStatus(false);
        return;
      }

      void markChatRead({
        appId: targetAppId,
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
    appId,
    chatId,
    chatBoxAppId: chatBoxData?.appId,
    chatRecordsLength: chatRecords.length,
    chatType,
    variableList,
    TextareaDom
  });
  const createQuestionGuide = useQuestionGuide({
    appId,
    chatId,
    questionGuide,
    outLinkAuthData,
    chatControllerRef: chatController,
    questionGuideControllerRef: questionGuideController,
    setQuestionGuide,
    scrollToBottom
  });

  const { abortRequest, generatingMessage, sendPrompt } = useChatGenerate({
    onStartChat,
    isRoundPending,
    chatControllerRef: chatController,
    questionGuideControllerRef: questionGuideController,
    pluginControllerRef: pluginController,
    resumeControllerRef: resumeController,
    resumedChatTargetRef,
    activeChatIdRef,
    TextareaDom,
    resetInputVal,
    setQuestionGuide,
    createQuestionGuide,
    scrollToBottom,
    generatingScroll,
    syncSidebarChatGenerateStatus,
    finishChatGenerateStatus
  });

  const handleStopSettled = useMemoizedFn((status: ChatGenerateStatusEnum, completed: boolean) => {
    const nextStatus = completed ? status : ChatGenerateStatusEnum.generating;
    setChatBoxData((state) =>
      state.chatId === chatId && state.appId === appId
        ? {
            ...state,
            chatGenerateStatus: nextStatus,
            hasBeenRead: false
          }
        : state
    );
    syncSidebarChatGenerateStatus(nextStatus, { hasBeenRead: false });
  });

  const { isRecordActionLoading, retryInput, editInput } = useChatRecordActions({
    sendPrompt,
    onDeleteChatItem
  });
  const {
    feedbackId,
    setFeedbackId,
    adminMarkData,
    setAdminMarkData,
    onMark,
    onAddUserLike,
    onAddUserDislike,
    onCloseCustomFeedback,
    onToggleFeedbackReadStatus,
    onFeedbackSuccess,
    onAdminMarkSuccess
  } = useChatFeedbackActions({
    feedbackType,
    showMarkIcon,
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
  }, [chatId, appId, abortRequest, setValue]);

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
    enableAutoResume,
    isReady,
    resumeTargetAiDataId,
    activeAppIdRef,
    activeChatIdRef,
    resumedChatTargetRef,
    resumeControllerRef: resumeController,
    generatingMessage,
    scrollToBottom,
    finishChatGenerateStatus
  });

  const canRenderChatInput = onStartChat && chatStarted && active && canSendQuery;
  const canSendPrompt = canRenderChatInput && !isRoundPending;

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
      showVoiceIcon,
      showMarkIcon,
      statusBoxData,
      questionGuides,
      onToggleDeletedGroup: toggleDeletedGroup,
      onRetry: retryInput,
      onEdit: editInput,
      onMark,
      onAddUserLike,
      onAddUserDislike,
      onCloseCustomFeedback,
      onToggleFeedbackReadStatus
    }),
    [
      processedRecords,
      expandedDeletedGroups,
      itemRefs,
      showVoiceIcon,
      showMarkIcon,
      statusBoxData,
      questionGuides,
      toggleDeletedGroup,
      retryInput,
      editInput,
      onMark,
      onAddUserLike,
      onAddUserDislike,
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
          onSendMessage={sendPrompt}
          onStop={() => abortRequest('stop')}
          onStopChat={requestStopChat}
          onStopSettled={handleStopSettled}
          disableSend={isRoundPending}
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
          />
          {canRenderChatInput && (
            <Box {...ChatInputWrapperStyle}>
              {showWorkorder && <WorkorderEntrance />}

              <ChatInput
                onSendMessage={sendPrompt}
                lastInteractive={lastInteractive}
                onStop={() => abortRequest('stop')}
                onStopChat={requestStopChat}
                onStopSettled={handleStopSettled}
                disableSend={isRoundPending}
                TextareaDom={TextareaDom}
                resetInputVal={resetInputVal}
                chatForm={chatForm}
              />
            </Box>
          )}
        </>
      )}

      <ChatBoxModals
        appId={appId}
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
  return (
    <ChatProvider {...props}>
      <ChatBox {...props} />
    </ChatProvider>
  );
};

export default React.memo(ChatBoxContainer);
