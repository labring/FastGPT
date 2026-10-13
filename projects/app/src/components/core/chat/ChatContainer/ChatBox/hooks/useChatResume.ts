import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useDocumentVisibility, useLatest, useMemoizedFn, useUpdateEffect } from 'ahooks';
import { useContextSelector } from 'use-context-selector';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getErrText } from '@fastgpt/global/common/error/utils';
import {
  ChatGenerateStatusEnum,
  ChatRoleEnum,
  ChatStatusEnum
} from '@fastgpt/global/core/chat/constants';
import { mergeNodeResponseDataByIdAndParent } from '@fastgpt/global/core/chat/utils/mergeNode';
import { streamResumeFetch, type ResumeStreamErrorType } from '@/web/common/api/fetch';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { WorkflowRuntimeContext } from '../../context/workflowRuntimeContext';
import { ChatBoxContext } from '../Provider';
import {
  getLastAiDataId,
  hasMeaningfulAiOutput,
  mergeResumeCompletedChatRecords,
  shouldCheckChatResumeStatus,
  shouldCreateResumeAiPlaceholder,
  shouldReplaceResumeAiValue,
  shouldResetResumeAiPlaceholder,
  waitForConflictRecoveryRecords
} from '../utils/resume';
import type { ChatGeneratingConflictRecovery, ChatSiteItemType } from '../type';
import type { generatingMessageProps } from '../../type';
import type { ChatAuthTargetInput } from '@/web/core/chat/utils';
import { useChatAuthApiTarget } from '@/web/core/chat/utils';
import { getChatHistoryStatus } from '@/web/core/chat/history/api';

type FinishChatGenerateStatus = (params: {
  status: ChatGenerateStatusEnum;
  finishedInActiveChat: boolean;
  targetChatTarget?: ChatAuthTargetInput;
  targetSourceKey?: string;
  targetChatId?: string;
  shouldUpdateChatBoxData?: (state: {
    sourceKey?: string;
    appId?: string;
    chatId?: string;
  }) => boolean;
}) => void;

type UseChatResumeProps = {
  enableAutoResume: boolean;
  isReady: boolean;
  resumeTargetAiDataId?: string;
  activeSourceKeyRef: MutableRefObject<string | undefined>;
  activeChatIdRef: MutableRefObject<string | undefined>;
  resumedChatTargetRef: MutableRefObject<string | undefined>;
  resumeControllerRef: MutableRefObject<AbortController | undefined>;
  generatingMessage: (message: generatingMessageProps) => void;
  flushGeneratingMessages: () => void;
  scrollToBottom: (behavior?: 'smooth' | 'auto', delay?: number) => void;
  finishChatGenerateStatus: FinishChatGenerateStatus;
  onChatGeneratingConflictRecovered?: () => void;
};

const isResumeLifecycleAbort = (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : reason;
  return message === 'leave' || message === 'replace';
};

/**
 * 恢复服务端仍在生成中的会话。
 *
 * 这个 hook 承接原 `ChatBox/index.tsx` 中的 auto resume effect。它只处理恢复生成：
 * - 判断当前会话是否需要恢复。
 * - 调用 `streamResumeFetch` 接收恢复流。
 * - 在本地补齐或复用 AI placeholder。
 * - 用调用方传入的 `generatingMessage` 复用现有 SSE 增量合并逻辑。
 * - 收尾同步当前 ChatBox 状态，并把生成状态变化交给调用方回调。
 *
 * 输入约定：
 * - `generatingMessage` 仍由 ChatBox 提供，确保普通发送和恢复生成继续共享同一套
 *   answer/reasoning/tool/plan/interactive 合并逻辑。
 * - `flushGeneratingMessages` 在恢复流收尾前提交最后一个 50ms buffer，避免 completedChat、
 *   finish 或 error 状态先于最后一批 SSE 增量写入。
 * - `activeSourceKeyRef/activeChatIdRef` 保存当前页面真实目标，用于防止恢复流异步返回后
 *   写入已经切走的会话。
 * - `resumedChatTargetRef` 记录本轮已经尝试恢复的 app/chat，避免同一个 generating
 *   会话在多次 render 后重复发起恢复请求。
 * - `resumeControllerRef` 写回当前恢复请求的 AbortController，让 `abortRequest('leave')`
 *   能在页面切换时中断恢复流。
 *
 * 关键边界：
 * - 只有 records 已加载、当前 ChatBox 数据和 runtime source/chat 对齐，并且状态仍为
 *   generating 时才恢复。
 * - 恢复流可能先到达 SSE 增量，再拿到完整 completedChat；因此需要按可见事件提前
 *   创建 AI placeholder，保证 `generatingMessage` 仍然只更新最后一条 AI 消息。
 * - 用户离开页面触发的 abort 不应把会话标记为 done/error，也不应弹出错误 toast。
 */
export const useChatResume = ({
  enableAutoResume,
  isReady,
  resumeTargetAiDataId,
  activeSourceKeyRef,
  activeChatIdRef,
  resumedChatTargetRef,
  resumeControllerRef,
  generatingMessage,
  flushGeneratingMessages,
  scrollToBottom,
  finishChatGenerateStatus,
  onChatGeneratingConflictRecovered
}: UseChatResumeProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const sourceKey = useContextSelector(WorkflowRuntimeContext, (v) => v.sourceKey);
  const sourceTarget = useContextSelector(WorkflowRuntimeContext, (v) => v.sourceTarget);
  const chatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);
  const chatAuthTarget = useChatAuthApiTarget({ sourceTarget, outLinkAuthData });
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);
  const chatBoxSourceKey = useContextSelector(ChatItemContext, (v) => v.chatBoxData.sourceKey);
  const chatBoxChatId = useContextSelector(ChatItemContext, (v) => v.chatBoxData.chatId);
  const chatGenerateStatus = useContextSelector(
    ChatItemContext,
    (v) => v.chatBoxData.chatGenerateStatus
  );
  const isChatRecordsLoaded = useContextSelector(ChatRecordContext, (v) => v.isChatRecordsLoaded);
  const setChatRecords = useContextSelector(ChatRecordContext, (v) => v.setChatRecords);
  const refreshChatRecords = useContextSelector(ChatRecordContext, (v) => v.refreshChatRecords);
  const isChatting = useContextSelector(ChatBoxContext, (v) => v.isChatting);
  const isChattingRef = useLatest(isChatting);
  const documentVisibility = useDocumentVisibility();
  const resumeStatusCheckingRef = useRef(false);
  const resumeRecordsRefreshRef = useRef<{
    sourceKey: string;
    chatId: string;
    conflictRecovery?: ChatGeneratingConflictRecovery;
  }>();
  const [resumeRequestVersion, setResumeRequestVersion] = useState(0);

  /** 判断当前前端状态是否允许发起状态确认或恢复请求。 */
  const canRequestChatResume = useMemoizedFn(() =>
    shouldCheckChatResumeStatus({
      enableAutoResume,
      isReady,
      isChatRecordsLoaded,
      sourceKey,
      chatId,
      isChatting,
      isResumeRequestActive: !!resumeControllerRef.current,
      chatBoxSourceKey,
      chatBoxChatId
    })
  );

  /**
   * 触发同一套流恢复流程。
   * 首次加载直接复用 provider 已加载的 records；冲突和页面重新显示时，
   * 通过 refreshRecords 让恢复流在建立 SSE 前统一刷新最新记录窗口。
   */
  const requestChatResume = useMemoizedFn(
    ({
      refreshRecords,
      conflictRecovery
    }: {
      refreshRecords: boolean;
      conflictRecovery?: ChatGeneratingConflictRecovery;
    }) => {
      if (!sourceKey || !chatId) return false;

      resumeRecordsRefreshRef.current = refreshRecords
        ? {
            sourceKey,
            chatId,
            conflictRecovery
          }
        : undefined;
      setChatBoxData((state) =>
        state.sourceKey === sourceKey && state.chatId === chatId
          ? {
              ...state,
              chatGenerateStatus: ChatGenerateStatusEnum.generating
            }
          : state
      );
      resumedChatTargetRef.current = undefined;
      setResumeRequestVersion((version) => version + 1);
      return true;
    }
  );

  /** 冲突恢复跳过状态快照，刷新记录后直接交给 resume endpoint 判断最终状态。 */
  const recoverChatGeneratingConflict = useMemoizedFn(
    (conflictRecovery: ChatGeneratingConflictRecovery) => {
      if (resumeStatusCheckingRef.current || !canRequestChatResume()) {
        return false;
      }

      return requestChatResume({ refreshRecords: true, conflictRecovery });
    }
  );

  /** 确认当前会话仍在服务端生成后，重新放开本地恢复去重并触发恢复流。 */
  const checkAndResumeChat = useMemoizedFn(async () => {
    if (resumeStatusCheckingRef.current || !canRequestChatResume()) {
      return false;
    }

    resumeStatusCheckingRef.current = true;

    try {
      const { list } = await getChatHistoryStatus({
        ...chatAuthTarget,
        chatIds: [chatId]
      });
      const currentStatus = list.find((item) => item.chatId === chatId)?.chatGenerateStatus;
      if (currentStatus !== ChatGenerateStatusEnum.generating) return false;
      if (
        activeSourceKeyRef.current !== sourceKey ||
        activeChatIdRef.current !== chatId ||
        isChattingRef.current ||
        resumeControllerRef.current
      ) {
        return false;
      }

      return requestChatResume({ refreshRecords: true });
    } catch {
      // 状态确认恢复属于 best-effort，不用检查错误干扰当前聊天。
      return false;
    } finally {
      resumeStatusCheckingRef.current = false;
    }
  });

  useUpdateEffect(() => {
    if (documentVisibility !== 'visible') return;
    void checkAndResumeChat();
  }, [documentVisibility]);

  useUpdateEffect(() => {
    resumeRecordsRefreshRef.current = undefined;
  }, [sourceKey, chatId]);

  useEffect(() => {
    if (
      !enableAutoResume ||
      !isReady ||
      !isChatRecordsLoaded ||
      !sourceKey ||
      !chatId ||
      isChatting ||
      chatBoxSourceKey !== sourceKey ||
      chatBoxChatId !== chatId ||
      chatGenerateStatus !== ChatGenerateStatusEnum.generating ||
      resumedChatTargetRef.current === `${sourceKey}:${chatId}`
    ) {
      return;
    }

    resumedChatTargetRef.current = `${sourceKey}:${chatId}`;

    const resumeForSourceKey = sourceKey;
    const resumeForChatTarget = chatAuthTarget;
    const resumeForChatId = chatId;
    const recordsRefreshRequest = resumeRecordsRefreshRef.current;
    const shouldRefreshRecords =
      recordsRefreshRequest?.sourceKey === sourceKey && recordsRefreshRequest.chatId === chatId;
    if (shouldRefreshRecords) {
      resumeRecordsRefreshRef.current = undefined;
    }
    let responseChatId = resumeTargetAiDataId ?? getNanoid(24);
    const controller = new AbortController();
    resumeControllerRef.current = controller;
    scrollToBottom('auto');
    scrollToBottom('auto', 100);
    let resumeFinalStatus = ChatGenerateStatusEnum.done;
    let hasPreparedResumeAiRecord = false;
    let hasReceivedResumeOutput = false;
    let hasStartedResumeStream = false;

    const isActiveResumeTarget = ({ sourceKey, chatId }: { sourceKey: string; chatId: string }) =>
      activeSourceKeyRef.current === sourceKey && activeChatIdRef.current === chatId;

    const getResumeUnavailablePlaceholderText = () => t('chat:resume_placeholder_generating');

    const upsertResumeAiPlaceholder = (
      responseChatId: string,
      text = '',
      status: `${ChatStatusEnum}` = ChatStatusEnum.loading,
      options?: { resetExistingValue?: boolean }
    ) => {
      setChatRecords((state) => {
        const lastItem = state[state.length - 1];
        if (lastItem?.dataId === responseChatId && lastItem.obj === ChatRoleEnum.AI) {
          const shouldReplaceValue = shouldReplaceResumeAiValue({
            hasExistingAiOutput: hasMeaningfulAiOutput(lastItem as ChatSiteItemType),
            text,
            resetExistingValue: options?.resetExistingValue
          });

          if (!shouldReplaceValue && lastItem.status === status) {
            return state;
          }

          return state.map((item, index) =>
            index !== state.length - 1
              ? item
              : {
                  ...item,
                  ...(shouldReplaceValue
                    ? {
                        value: [
                          {
                            text: {
                              content: text
                            }
                          }
                        ],
                        responseData: options?.resetExistingValue ? [] : item.responseData
                      }
                    : {}),
                  status,
                  ...(status === ChatStatusEnum.finish ? { time: new Date() } : {})
                }
          );
        }

        return [
          ...state,
          {
            id: responseChatId,
            dataId: responseChatId,
            obj: ChatRoleEnum.AI,
            value: [
              {
                text: {
                  content: text
                }
              }
            ],
            status,
            ...(status === ChatStatusEnum.finish ? { time: new Date() } : {})
          }
        ];
      });
    };

    /** 完成恢复流对应的 AI record，并清理未产生有效输出的临时占位。 */
    const finishResumeAiRecord = ({
      responseText = '',
      removablePlaceholderText,
      mergeResponseData = true
    }: {
      responseText?: string;
      removablePlaceholderText?: string;
      mergeResponseData?: boolean;
    }) => {
      setChatRecords((state) => {
        const currentLastItem = state.at(-1);
        if (currentLastItem?.dataId !== responseChatId || currentLastItem.obj !== ChatRoleEnum.AI) {
          return state;
        }

        const updatedLastItem = {
          ...currentLastItem,
          status: ChatStatusEnum.finish,
          time: new Date(),
          ...(mergeResponseData
            ? {
                responseData: mergeNodeResponseDataByIdAndParent(currentLastItem.responseData || [])
              }
            : {})
        };
        const hasOnlyRemovablePlaceholder =
          !hasReceivedResumeOutput &&
          removablePlaceholderText !== undefined &&
          updatedLastItem.value.length === 1 &&
          updatedLastItem.value[0]?.text?.content === removablePlaceholderText &&
          !updatedLastItem.responseData?.length;

        if (
          (!hasMeaningfulAiOutput(updatedLastItem as ChatSiteItemType) ||
            hasOnlyRemovablePlaceholder) &&
          !responseText
        ) {
          return state.slice(0, -1);
        }

        return [...state.slice(0, -1), updatedLastItem];
      });
    };

    (async () => {
      try {
        if (shouldRefreshRecords && recordsRefreshRequest) {
          const refreshedRecords = recordsRefreshRequest.conflictRecovery
            ? await waitForConflictRecoveryRecords({
                ...recordsRefreshRequest.conflictRecovery,
                loadRecords: refreshChatRecords,
                signal: controller.signal
              })
            : await refreshChatRecords();
          if (!refreshedRecords) {
            throw new Error('Failed to load the active chat round');
          }
          if (!isActiveResumeTarget({ sourceKey: resumeForSourceKey, chatId: resumeForChatId })) {
            return;
          }

          responseChatId = getLastAiDataId(refreshedRecords) ?? responseChatId;
          setChatRecords((records) =>
            records.map((record) =>
              record.obj === ChatRoleEnum.AI && record.dataId === responseChatId
                ? { ...record, status: ChatStatusEnum.loading }
                : record
            )
          );
          scrollToBottom('auto');
        }

        hasStartedResumeStream = true;
        const { responseText, completedChat, resumeUnavailable } = await streamResumeFetch({
          ...resumeForChatTarget,
          chatId: resumeForChatId,
          controller,
          onResumeReady:
            shouldRefreshRecords && recordsRefreshRequest?.conflictRecovery
              ? () => {
                  if (
                    isActiveResumeTarget({
                      sourceKey: resumeForSourceKey,
                      chatId: resumeForChatId
                    })
                  ) {
                    onChatGeneratingConflictRecovered?.();
                  }
                }
              : undefined,
          onResumeUnavailable: () => {
            if (
              !isActiveResumeTarget({
                sourceKey: resumeForSourceKey,
                chatId: resumeForChatId
              })
            )
              return;
            resumeFinalStatus = ChatGenerateStatusEnum.generating;
            upsertResumeAiPlaceholder(
              responseChatId,
              getResumeUnavailablePlaceholderText(),
              ChatStatusEnum.loading
            );
          },
          onmessage: (message) => {
            if (
              !isActiveResumeTarget({
                sourceKey: resumeForSourceKey,
                chatId: resumeForChatId
              })
            )
              return;
            if (shouldCreateResumeAiPlaceholder(message.event)) {
              upsertResumeAiPlaceholder(responseChatId, '', ChatStatusEnum.loading, {
                resetExistingValue: shouldResetResumeAiPlaceholder({
                  hasPreparedResumeAiRecord,
                  hasReceivedResumeOutput
                })
              });
              hasPreparedResumeAiRecord = true;
            }
            generatingMessage(message);
            hasReceivedResumeOutput = true;
          }
        });

        if (!isActiveResumeTarget({ sourceKey: resumeForSourceKey, chatId: resumeForChatId }))
          return;

        flushGeneratingMessages();

        if (completedChat) {
          resumeFinalStatus = completedChat.chatGenerateStatus;
          setChatRecords((state) =>
            mergeResumeCompletedChatRecords({
              currentRecords: state,
              completedRecords: completedChat.records.list.map((item) => ({
                ...item,
                status: ChatStatusEnum.finish
              })),
              responseChatId
            })
          );
          scrollToBottom('auto');
          scrollToBottom('auto', 100);
          return;
        }

        if (resumeUnavailable) {
          resumeFinalStatus = ChatGenerateStatusEnum.done;
          finishResumeAiRecord({
            responseText,
            removablePlaceholderText: getResumeUnavailablePlaceholderText()
          });
          scrollToBottom('auto');
          return;
        }

        finishResumeAiRecord({ responseText });
        scrollToBottom('auto');
      } catch (error) {
        if (controller.signal.aborted) {
          // 离开页面或被新恢复流替换时不再提交旧流数据；用户主动停止仍需落下最后一个 buffer。
          if (
            !isResumeLifecycleAbort(controller.signal.reason) &&
            isActiveResumeTarget({ sourceKey: resumeForSourceKey, chatId: resumeForChatId })
          ) {
            flushGeneratingMessages();
          }
          return;
        }
        if (!isActiveResumeTarget({ sourceKey: resumeForSourceKey, chatId: resumeForChatId }))
          return;

        if (!hasStartedResumeStream) {
          // 记录刷新失败不代表服务端生成结束，保留 generating 等待下一次可见性恢复。
          resumeFinalStatus = ChatGenerateStatusEnum.generating;
          return;
        }

        flushGeneratingMessages();

        const isStreamError = (error as ResumeStreamErrorType | undefined)?.isStreamError === true;
        resumeFinalStatus = isStreamError
          ? ChatGenerateStatusEnum.error
          : ChatGenerateStatusEnum.done;

        finishResumeAiRecord({ mergeResponseData: false });
        scrollToBottom('auto');

        if (isStreamError) {
          toast({
            title: t(getErrText(error, t('common:core.chat.error.Chat error') as any)),
            status: 'error',
            duration: 5000,
            isClosable: true
          });
        }
      } finally {
        if (resumeControllerRef.current === controller) {
          resumeControllerRef.current = undefined;
        }
        const finishedInActiveChat = isActiveResumeTarget({
          sourceKey: resumeForSourceKey,
          chatId: resumeForChatId
        });
        const interruptedByLifecycle =
          controller.signal.aborted && isResumeLifecycleAbort(controller.signal.reason);

        if (interruptedByLifecycle) {
          return;
        }

        finishChatGenerateStatus({
          status: resumeFinalStatus,
          finishedInActiveChat,
          targetChatTarget: resumeForChatTarget,
          targetSourceKey: resumeForSourceKey,
          targetChatId: resumeForChatId
        });
      }
    })();
  }, [
    enableAutoResume,
    isReady,
    isChatRecordsLoaded,
    sourceKey,
    chatAuthTarget,
    chatId,
    isChatting,
    chatBoxSourceKey,
    chatBoxChatId,
    chatGenerateStatus,
    flushGeneratingMessages,
    generatingMessage,
    resumeTargetAiDataId,
    scrollToBottom,
    setChatRecords,
    refreshChatRecords,
    finishChatGenerateStatus,
    onChatGeneratingConflictRecovered,
    t,
    toast,
    activeSourceKeyRef,
    activeChatIdRef,
    resumedChatTargetRef,
    resumeControllerRef,
    resumeRequestVersion
  ]);

  return {
    recoverChatGeneratingConflict
  };
};
