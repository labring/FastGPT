import React, { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createContext, useContextSelector } from 'use-context-selector';
import { useMemoizedFn } from 'ahooks';
import type { PluginRunBoxProps } from './type';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { PluginRunBoxTabEnum } from './constants';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import {
  ChatGenerateStatusEnum,
  ChatRoleEnum,
  ChatSourceTypeEnum,
  ChatStatusEnum
} from '@fastgpt/global/core/chat/constants';
import type { generatingMessageProps } from '../type';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { useTranslation } from 'next-i18next';
import type { ChatBoxInputFormType, ChatGeneratingConflictRecovery } from '../ChatBox/type';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { clientGetWorkflowToolRunUserQuery } from '@/components/core/chat/ChatContainer/PluginRunBox/utils';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import type { ResolvedChatAuthTargetInput } from '@/web/core/chat/type';
import { useChatAuthApiTarget } from '@/web/core/chat/utils';
import { getChatHistoryStatus } from '@/web/core/chat/history/api';
import {
  appendNodeResponseByParent,
  mergeNodeResponseDataByIdAndParent
} from '@fastgpt/global/core/chat/utils/mergeNode';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { isChatEntryModerationError } from '@fastgpt/global/core/chat/error';
import {
  WorkflowRuntimeContext,
  WorkflowRuntimeContextProvider
} from '@/components/core/chat/ChatContainer/context/workflowRuntimeContext';
import {
  getChatGeneratingConflictData,
  isChatGeneratingError,
  safeAbortController
} from '../ChatBox/utils/generate';
import { getLastAiDataId } from '../ChatBox/utils/resume';
import { useChatResume } from '../ChatBox/hooks/useChatResume';

type PluginRunContextType = PluginRunBoxProps & {
  isChatting: boolean;
  onSubmit: (e: ChatBoxInputFormType) => Promise<any>;
  instruction: string;
};

type PluginRunMessageTarget = {
  runSourceKey: string;
  runAppId: string;
  runChatId: string;
  responseChatItemId?: string;
};

const isAbortByLeave = (reason: unknown) =>
  reason === 'leave' || (reason instanceof Error && reason.message === 'leave');

export const PluginRunContext = createContext<
  Omit<PluginRunContextType, 'appId' | 'chatId' | 'outLinkAuthData'>
>({
  isChatting: false,
  onSubmit: function (): Promise<any> {
    throw new Error('Function not implemented.');
  },
  instruction: ''
});

const PluginRunContextInner = ({
  children,
  ...props
}: PluginRunBoxProps & { children: ReactNode }) => {
  const {
    onStartChat,
    onMarkChatRead,
    onChatGenerateStatusChange,
    appId,
    chatId,
    outLinkAuthData,
    isReady = true
  } = props;

  const sourceTarget = useContextSelector(WorkflowRuntimeContext, (v) => v.sourceTarget);
  const sourceKey = useContextSelector(WorkflowRuntimeContext, (v) => v.sourceKey);
  const chatAuthTarget = useChatAuthApiTarget({ sourceTarget, outLinkAuthData });

  const pluginInputs = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.app?.pluginInputs);
  const setTab = useContextSelector(ChatItemContext, (v) => v.setPluginRunTab);
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);
  const resetVariables = useContextSelector(ChatItemContext, (v) => v.resetVariables);
  const chatConfig = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.app?.chatConfig);
  const chatBoxSourceKey = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.sourceKey);
  const chatBoxAppId = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.appId);
  const chatBoxChatId = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.chatId);
  const chatGenerateStatus = useContextSelector(
    ChatItemContext,
    (v) => v.chatBoxData?.chatGenerateStatus
  );

  const setChatRecords = useContextSelector(ChatRecordContext, (v) => v.setChatRecords);
  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const isLoadingRecords = useContextSelector(ChatRecordContext, (v) => v.isLoadingRecords);

  const instruction = chatConfig?.instruction || '';

  const { toast } = useToast();
  const { t } = useTranslation();

  const chatControllerRef = useRef<AbortController>();
  const resumeControllerRef = useRef<AbortController>();
  const resumedChatTargetRef = useRef<string | undefined>();
  const activeSourceKeyRef = useRef<string | undefined>(sourceKey);
  const activeChatIdRef = useRef<string | undefined>(chatId);
  const [chatGeneratingConflict, setChatGeneratingConflict] =
    useState<ChatGeneratingConflictRecovery>();

  /** 中断当前窗口的直连流与恢复流；离开切换使用 leave 保留服务端生成状态。 */
  const abortRequest = useMemoizedFn((reason: 'stop' | 'leave' = 'stop') => {
    safeAbortController(chatControllerRef.current, reason);
    safeAbortController(resumeControllerRef.current, reason);
  });

  useEffect(() => {
    activeSourceKeyRef.current = sourceKey;
    activeChatIdRef.current = chatId;
    resumedChatTargetRef.current = undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on chat switch
    setChatGeneratingConflict(undefined);

    return () => {
      // 切换会话或卸载组件（例如切往普通对话应用）时清空活跃标识，并按 leave 断开本地订阅，
      // 防止旧流继续写入外层共享的 ChatRecordContext 或对已离开的会话误发 markRead。
      activeSourceKeyRef.current = undefined;
      activeChatIdRef.current = undefined;
      abortRequest('leave');
    };
  }, [sourceKey, chatId, abortRequest]);

  useEffect(() => {
    const handlePageHide = (event: PageTransitionEvent) => {
      if (!event.persisted) abortRequest('leave');
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [abortRequest]);

  /** 结合组件活跃 ref 与全局会话 store，校验某轮插件运行是否仍对应当前可见会话。 */
  const isTargetActive = useCallback(
    ({
      targetSourceKey,
      targetAppId,
      targetChatId,
      resolvedChatId
    }: {
      targetSourceKey: string;
      targetAppId: string;
      targetChatId: string;
      resolvedChatId?: string;
    }) => {
      if (activeSourceKeyRef.current !== targetSourceKey) return false;

      const storeState = useChatStore.getState();
      if (storeState.appId && storeState.appId !== targetAppId) return false;

      if (targetChatId) {
        if (activeChatIdRef.current !== targetChatId) return false;
        if (storeState.chatId && storeState.chatId !== targetChatId) return false;
        return true;
      }

      if (resolvedChatId) {
        if (activeChatIdRef.current && activeChatIdRef.current !== resolvedChatId) {
          return false;
        }
        return storeState.chatId === resolvedChatId;
      }

      return !activeChatIdRef.current && !storeState.chatId;
    },
    []
  );

  const notifyChatGenerateStatusChange = useMemoizedFn(
    (
      status: ChatGenerateStatusEnum,
      options?: {
        targetAppId?: string;
        targetChatId?: string;
        hasBeenRead?: boolean;
        title?: string;
      }
    ) => {
      const targetAppId = options?.targetAppId ?? appId;
      const targetChatId = options?.targetChatId ?? chatId;
      if (!targetAppId || !targetChatId) return;

      onChatGenerateStatusChange?.({
        sourceTarget: {
          sourceType: ChatSourceTypeEnum.app,
          sourceId: targetAppId
        },
        chatId: targetChatId,
        status,
        hasBeenRead: options?.hasBeenRead,
        title: options?.title
      });
    }
  );

  const finishChatGenerateStatus = useMemoizedFn(
    ({
      status,
      finishedInActiveChat,
      targetChatTarget = chatAuthTarget,
      targetSourceKey = sourceKey,
      targetAppId,
      targetChatId = chatId,
      shouldUpdateChatBoxData,
      skipMarkRead = false
    }: {
      status: ChatGenerateStatusEnum;
      finishedInActiveChat: boolean;
      targetChatTarget?: ResolvedChatAuthTargetInput;
      targetSourceKey?: string;
      targetAppId?: string;
      targetChatId?: string;
      shouldUpdateChatBoxData?: (state: {
        sourceKey?: string;
        appId?: string;
        chatId?: string;
      }) => boolean;
      skipMarkRead?: boolean;
    }) => {
      const appSourcePrefix = `${ChatSourceTypeEnum.app}:`;
      const resolvedAppId =
        targetAppId ??
        (targetSourceKey?.startsWith(appSourcePrefix)
          ? targetSourceKey.slice(appSourcePrefix.length)
          : appId);
      if (!resolvedAppId || !targetChatId) return;

      const isGenerating = status === ChatGenerateStatusEnum.generating;

      setChatBoxData?.((state) =>
        (shouldUpdateChatBoxData?.(state) ??
        ((state.sourceKey === targetSourceKey || state.appId === resolvedAppId) &&
          state.chatId === targetChatId))
          ? {
              ...state,
              chatGenerateStatus: status,
              hasBeenRead: isGenerating ? false : finishedInActiveChat
            }
          : state
      );

      const syncStatus = (hasBeenRead: boolean) => {
        notifyChatGenerateStatusChange(status, {
          targetAppId: resolvedAppId,
          targetChatId,
          hasBeenRead
        });
      };

      if (isGenerating || !finishedInActiveChat || skipMarkRead || !onMarkChatRead) {
        syncStatus(isGenerating ? false : finishedInActiveChat);
        return;
      }

      void onMarkChatRead({
        ...targetChatTarget,
        chatId: targetChatId
      })
        .catch(() => {})
        .finally(() => {
          syncStatus(true);
        });
    }
  );

  /**
   * 统一收口前台非 leave 传输中断（60s 超时 abort、网络断开或异常 reject）：
   * 先向服务端核对真实租约状态，未落库时清理占位解锁按钮，仍在生成时移交 useChatResume 恢复，
   * 已落库结束时再收尾并按活跃状态标已读。
   */
  const reconcileInterruptedRun = useMemoizedFn(
    async ({
      runAppId,
      runSourceKey,
      runChatId,
      targetChatId,
      runChatTarget,
      finishedInActiveChat,
      previousRecords,
      responseChatItemId,
      errorMsg
    }: {
      runAppId: string;
      runSourceKey: string;
      runChatId: string;
      targetChatId: string;
      runChatTarget: ResolvedChatAuthTargetInput;
      finishedInActiveChat: boolean;
      previousRecords: typeof chatRecords;
      responseChatItemId: string;
      errorMsg?: string;
    }) => {
      if (!runAppId || !targetChatId) return;

      let serverItem: { chatId: string; chatGenerateStatus?: ChatGenerateStatusEnum } | undefined;
      let statusCheckFailed = false;
      try {
        const { list } = await getChatHistoryStatus({
          ...runChatTarget,
          chatIds: [targetChatId]
        });
        serverItem = list.find((item) => item.chatId === targetChatId);
      } catch {
        statusCheckFailed = true;
      }

      const stillActive =
        finishedInActiveChat &&
        isTargetActive({
          targetSourceKey: runSourceKey,
          targetAppId: runAppId,
          targetChatId: runChatId,
          resolvedChatId: targetChatId
        });

      if (
        serverItem?.chatGenerateStatus === ChatGenerateStatusEnum.generating ||
        statusCheckFailed
      ) {
        if (stillActive) {
          setChatRecords(previousRecords);
          if (serverItem?.chatGenerateStatus === ChatGenerateStatusEnum.generating) {
            setChatBoxData?.((state) =>
              (state.sourceKey === runSourceKey || state.appId === runAppId) &&
              state.chatId === targetChatId
                ? {
                    ...state,
                    chatGenerateStatus: ChatGenerateStatusEnum.done
                  }
                : state
            );
            setChatGeneratingConflict({
              previousAiDataId: getLastAiDataId(previousRecords),
              canReusePreviousAi: false
            });
          } else if (errorMsg) {
            toast({ title: errorMsg, status: 'error' });
          }
        }
        notifyChatGenerateStatusChange(ChatGenerateStatusEnum.generating, {
          targetAppId: runAppId,
          targetChatId,
          hasBeenRead: false
        });
        return;
      }

      if (!serverItem) {
        if (stillActive) {
          if (errorMsg) {
            toast({ title: errorMsg, status: 'error' });
          }
          setChatRecords(previousRecords);
          if (previousRecords.length === 0) {
            setTab(PluginRunBoxTabEnum.input);
          }
        }
        finishChatGenerateStatus({
          status: ChatGenerateStatusEnum.done,
          finishedInActiveChat: stillActive,
          targetChatTarget: runChatTarget,
          targetSourceKey: runSourceKey,
          targetAppId: runAppId,
          targetChatId,
          skipMarkRead: true
        });
        return;
      }

      if (stillActive) {
        if (errorMsg) {
          toast({ title: errorMsg, status: 'error' });
        }
        setChatRecords((state) =>
          state.map((item, index) => {
            if (index !== state.length - 1 || item.dataId !== responseChatItemId) return item;
            return {
              ...item,
              status: ChatStatusEnum.finish
            };
          })
        );
      }
      finishChatGenerateStatus({
        status: ChatGenerateStatusEnum.done,
        finishedInActiveChat: stillActive,
        targetChatTarget: runChatTarget,
        targetSourceKey: runSourceKey,
        targetAppId: runAppId,
        targetChatId
      });
    }
  );

  const applyGeneratingMessage = useCallback(
    (
      {
        event,
        text = '',
        status,
        name,
        tool,
        nodeResponse,
        variables,
        title
      }: generatingMessageProps,
      runTarget?: PluginRunMessageTarget
    ) => {
      const targetSourceKey = runTarget?.runSourceKey ?? sourceKey;
      const targetAppId = runTarget?.runAppId ?? appId;
      const targetChatId = runTarget?.runChatId ?? chatId;
      const isCurrentTarget = isTargetActive({
        targetSourceKey,
        targetAppId,
        targetChatId
      });

      if (event === SseResponseEventEnum.chatTitle && title) {
        if (isCurrentTarget) {
          setChatBoxData?.((state) =>
            (state.sourceKey === targetSourceKey || state.appId === targetAppId) &&
            state.chatId === targetChatId
              ? {
                  ...state,
                  title
                }
              : state
          );
        }
        notifyChatGenerateStatusChange(ChatGenerateStatusEnum.generating, {
          targetAppId,
          targetChatId,
          title
        });
        return;
      }

      if (!isCurrentTarget) return;

      if (event === SseResponseEventEnum.updateVariables && variables) {
        resetVariables({ variables });
        return;
      }

      setChatRecords((state) =>
        state.map((item, index) => {
          if (index !== state.length - 1 || item.obj !== ChatRoleEnum.AI) return item;
          if (runTarget?.responseChatItemId && item.dataId !== runTarget.responseChatItemId) {
            return item;
          }

          const rawLastValue = item.value[item.value.length - 1];
          const lastValue: AIChatItemValueItemType | undefined = rawLastValue
            ? JSON.parse(JSON.stringify(rawLastValue))
            : undefined;

          if (event === SseResponseEventEnum.flowNodeResponse && nodeResponse) {
            return {
              ...item,
              responseData: appendNodeResponseByParent(item.responseData, nodeResponse)
            };
          } else if (event === SseResponseEventEnum.flowNodeStatus && status) {
            return {
              ...item,
              status,
              moduleName: name
            };
          } else if (
            (event === SseResponseEventEnum.answer || event === SseResponseEventEnum.fastAnswer) &&
            text
          ) {
            if (!lastValue || !lastValue.text) {
              const newValue: AIChatItemValueItemType = {
                text: {
                  content: text
                }
              };
              return {
                ...item,
                value: item.value.concat(newValue)
              };
            } else {
              lastValue.text.content += text;
              return {
                ...item,
                value: item.value.slice(0, -1).concat(lastValue)
              };
            }
          } else if (event === SseResponseEventEnum.toolCall && tool) {
            const val: AIChatItemValueItemType = {
              tools: [tool]
            };
            return {
              ...item,
              value: item.value.concat(val)
            };
          } else if (event === SseResponseEventEnum.toolParams && tool && lastValue?.tools) {
            lastValue.tools = lastValue.tools.map((item) => {
              if (item.id === tool.id) {
                item.params += tool.params;
              }
              return item;
            });
            return {
              ...item,
              value: item.value.slice(0, -1).concat(lastValue)
            };
          } else if (event === SseResponseEventEnum.toolResponse && tool) {
            // replace tool response
            return {
              ...item,
              value: item.value.map((val) => {
                if (val.tools) {
                  const tools = val.tools.map((item) =>
                    item.id === tool.id ? { ...item, response: tool.response } : item
                  );
                  return {
                    ...val,
                    tools
                  };
                }
                return val;
              })
            };
          }

          return item;
        })
      );
    },
    [
      appId,
      chatId,
      isTargetActive,
      notifyChatGenerateStatusChange,
      resetVariables,
      setChatBoxData,
      setChatRecords,
      sourceKey
    ]
  );

  const isRecordChatting = Boolean(
    chatRecords[chatRecords.length - 1] &&
    chatRecords[chatRecords.length - 1]?.status !== ChatStatusEnum.finish
  );
  const isCurrentChatGenerating = Boolean(
    appId &&
    chatId &&
    (chatBoxSourceKey === sourceKey || chatBoxAppId === appId) &&
    chatBoxChatId === chatId &&
    chatGenerateStatus === ChatGenerateStatusEnum.generating
  );
  const isChatting = isRecordChatting || isCurrentChatGenerating;

  const resumeTargetAiDataId = useMemo(() => getLastAiDataId(chatRecords), [chatRecords]);
  const noop = useCallback(() => {}, []);
  const handleResumeGeneratingMessage = useMemoizedFn((message: generatingMessageProps) => {
    applyGeneratingMessage(message);
  });
  const handleResumeStart = useMemoizedFn(() => {
    setTab(PluginRunBoxTabEnum.output);
  });
  const onChatGeneratingConflictRecovered = useMemoizedFn(() => {
    toast({
      title: t('chat:chat_generating_resumed'),
      status: 'info',
      duration: 5000
    });
  });

  const { recoverChatGeneratingConflict } = useChatResume({
    enableAutoResume: Boolean(onStartChat),
    isReady,
    isChatting: isRecordChatting,
    resumeTargetAiDataId,
    activeSourceKeyRef,
    activeChatIdRef,
    resumedChatTargetRef,
    resumeControllerRef,
    generatingMessage: handleResumeGeneratingMessage,
    flushGeneratingMessages: noop,
    scrollToBottom: noop,
    finishChatGenerateStatus,
    onResumeStart: handleResumeStart,
    onChatGeneratingConflictRecovered
  });

  useEffect(() => {
    if (!chatGeneratingConflict || isRecordChatting) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- consume the one-shot recovery signal after the failed round is rolled back
    setChatGeneratingConflict(undefined);
    recoverChatGeneratingConflict(chatGeneratingConflict);
  }, [chatGeneratingConflict, isRecordChatting, recoverChatGeneratingConflict]);

  const onSubmit = useCallback(
    async ({ variables }: ChatBoxInputFormType) => {
      if (!onStartChat || !isReady || isLoadingRecords) return;
      if (isChatting) {
        toast({
          title: t('chat:is_chatting'),
          status: 'warning'
        });
        return;
      }

      const previousRecords = chatRecords;
      const abortSignal = new AbortController();
      chatControllerRef.current = abortSignal;
      resumedChatTargetRef.current = undefined;

      const runAppId = appId;
      const runSourceKey = sourceKey;
      const runChatId = chatId;
      const runChatTarget = chatAuthTarget;
      const humanChatItemId = getNanoid(24);
      const responseChatItemId = getNanoid(24);
      const isLeaveAborted = () =>
        abortSignal.signal.aborted && isAbortByLeave(abortSignal.signal.reason);

      setChatRecords([
        {
          ...clientGetWorkflowToolRunUserQuery({
            pluginInputs,
            variables
          }),
          dataId: humanChatItemId,
          status: ChatStatusEnum.finish
        },
        {
          dataId: responseChatItemId,
          obj: ChatRoleEnum.AI,
          value: [
            {
              text: {
                content: ''
              }
            }
          ],
          status: ChatStatusEnum.loading
        }
      ]);
      setTab(PluginRunBoxTabEnum.output);
      setChatBoxData?.((state) =>
        (state.sourceKey === runSourceKey || state.appId === runAppId) && state.chatId === runChatId
          ? {
              ...state,
              chatGenerateStatus: ChatGenerateStatusEnum.generating,
              hasBeenRead: false
            }
          : state
      );
      notifyChatGenerateStatusChange(ChatGenerateStatusEnum.generating, {
        targetAppId: runAppId,
        targetChatId: runChatId,
        hasBeenRead: false
      });

      const messages = chats2GPTMessages({
        messages: [
          {
            dataId: getNanoid(24),
            obj: ChatRoleEnum.Human,
            value: []
          }
        ],
        reserveId: true,
        reserveTool: true
      });

      const resolveTargetChatId = () => runChatId || useChatStore.getState().chatId;

      try {
        await onStartChat({
          messages,
          responseChatItemId,
          controller: abortSignal,
          generatingMessage: (message) =>
            applyGeneratingMessage(message, {
              runSourceKey,
              runAppId,
              runChatId,
              responseChatItemId
            }),
          variables
        });

        // 离开切换仅断开本地订阅，服务端仍继续执行，不能提前把原会话置为 done。
        if (isLeaveAborted()) return;

        const targetChatId = resolveTargetChatId();
        const finishedInActiveChat = isTargetActive({
          targetSourceKey: runSourceKey,
          targetAppId: runAppId,
          targetChatId: runChatId,
          resolvedChatId: targetChatId
        });

        if (abortSignal.signal.aborted) {
          await reconcileInterruptedRun({
            runAppId,
            runSourceKey,
            runChatId,
            targetChatId,
            runChatTarget,
            finishedInActiveChat,
            previousRecords,
            responseChatItemId
          });
          return;
        }

        if (finishedInActiveChat) {
          setChatRecords((state) =>
            state.map((item, index) => {
              if (index !== state.length - 1 || item.dataId !== responseChatItemId) return item;

              // Check node response error
              const responseData = mergeNodeResponseDataByIdAndParent(item.responseData || []);
              if (responseData[responseData.length - 1]?.error) {
                toast({
                  title: t(getErrText(responseData[responseData.length - 1].error)),
                  status: 'error'
                });
              }

              return {
                ...item,
                status: ChatStatusEnum.finish,
                responseData
              };
            })
          );
        }

        finishChatGenerateStatus({
          status: ChatGenerateStatusEnum.done,
          finishedInActiveChat,
          targetChatTarget: runChatTarget,
          targetSourceKey: runSourceKey,
          targetAppId: runAppId,
          targetChatId
        });
      } catch (err: any) {
        // 浏览器刷新会先拒绝 fetch，再派发 pagehide；让出当前任务等 leave 标记落位。
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (isLeaveAborted() || isAbortByLeave(err)) return;

        const targetChatId = resolveTargetChatId();
        const finishedInActiveChat = isTargetActive({
          targetSourceKey: runSourceKey,
          targetAppId: runAppId,
          targetChatId: runChatId,
          resolvedChatId: targetChatId
        });

        if (isChatGeneratingError(err)) {
          if (finishedInActiveChat) {
            setChatRecords(previousRecords);
            setChatBoxData?.((state) =>
              (state.sourceKey === runSourceKey || state.appId === runAppId) &&
              state.chatId === targetChatId
                ? {
                    ...state,
                    chatGenerateStatus: ChatGenerateStatusEnum.done
                  }
                : state
            );
            const conflictData = getChatGeneratingConflictData(err);
            setChatGeneratingConflict({
              responseChatItemId: conflictData?.responseChatItemId,
              previousAiDataId: getLastAiDataId(previousRecords),
              canReusePreviousAi: conflictData?.reusePreviousAi ?? false
            });
          }
          return;
        }

        const errorMsg = t(getErrText(err, t('common:core.chat.error.Chat error') as any));

        if (isChatEntryModerationError(err)) {
          if (finishedInActiveChat) {
            toast({ title: errorMsg, status: 'warning' });
            setChatRecords([]);
            setTab(PluginRunBoxTabEnum.input);
          }
          finishChatGenerateStatus({
            status: ChatGenerateStatusEnum.done,
            finishedInActiveChat,
            targetChatTarget: runChatTarget,
            targetSourceKey: runSourceKey,
            targetAppId: runAppId,
            targetChatId,
            skipMarkRead: true
          });
          return;
        }

        await reconcileInterruptedRun({
          runAppId,
          runSourceKey,
          runChatId,
          targetChatId,
          runChatTarget,
          finishedInActiveChat,
          previousRecords,
          responseChatItemId,
          errorMsg
        });
      } finally {
        if (chatControllerRef.current === abortSignal) {
          chatControllerRef.current = undefined;
        }
      }
    },
    [
      appId,
      applyGeneratingMessage,
      chatAuthTarget,
      chatId,
      chatRecords,
      finishChatGenerateStatus,
      isChatting,
      isLoadingRecords,
      isReady,
      isTargetActive,
      notifyChatGenerateStatusChange,
      onStartChat,
      pluginInputs,
      reconcileInterruptedRun,
      setChatBoxData,
      setChatRecords,
      setTab,
      sourceKey,
      t,
      toast
    ]
  );

  const contextValue: PluginRunContextType = {
    ...props,
    isChatting,
    onSubmit,
    instruction
  };
  return <PluginRunContext.Provider value={contextValue}>{children}</PluginRunContext.Provider>;
};

const PluginRunContextProvider = ({
  children,
  ...props
}: PluginRunBoxProps & { children: ReactNode }) => {
  return (
    <WorkflowRuntimeContextProvider
      sourceTarget={{ sourceType: ChatSourceTypeEnum.app, sourceId: props.appId }}
      chatId={props.chatId}
      outLinkAuthData={props.outLinkAuthData}
      fileUploadMode={props.fileUploadMode ?? 'runtime'}
    >
      <PluginRunContextInner {...props}>{children}</PluginRunContextInner>
    </WorkflowRuntimeContextProvider>
  );
};

export default PluginRunContextProvider;
