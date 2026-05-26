import { useEffect, type MutableRefObject } from 'react';
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
import { mergeChatResponseData } from '@fastgpt/global/core/chat/utils';
import { streamResumeFetch, type ResumeStreamErrorType } from '@/web/common/api/fetch';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { WorkflowRuntimeContext } from '../../context/workflowRuntimeContext';
import { ChatBoxContext } from '../Provider';
import {
  hasMeaningfulAiOutput,
  mergeResumeCompletedChatRecords,
  shouldCreateResumeAiPlaceholder,
  shouldReplaceResumeAiValue,
  shouldResetResumeAiPlaceholder
} from '../utils/resume';
import type { ChatSiteItemType } from '../type';
import type { generatingMessageProps } from '../../type';

type FinishChatGenerateStatus = (params: {
  status: ChatGenerateStatusEnum;
  finishedInActiveChat: boolean;
  targetAppId?: string;
  targetChatId?: string;
  shouldUpdateChatBoxData?: (state: { appId?: string; chatId?: string }) => boolean;
}) => void;

type UseChatResumeProps = {
  enableAutoResume: boolean;
  isReady: boolean;
  resumeTargetAiDataId?: string;
  activeAppIdRef: MutableRefObject<string | undefined>;
  activeChatIdRef: MutableRefObject<string | undefined>;
  resumedChatTargetRef: MutableRefObject<string | undefined>;
  resumeControllerRef: MutableRefObject<AbortController | undefined>;
  generatingMessage: (message: generatingMessageProps) => void;
  scrollToBottom: (behavior?: 'smooth' | 'auto', delay?: number) => void;
  finishChatGenerateStatus: FinishChatGenerateStatus;
};

const isAbortByLeave = (reason: unknown) => {
  return reason === 'leave' || (reason instanceof Error && reason.message === 'leave');
};

/**
 * 恢复服务端仍在生成中的会话。
 *
 * 这个 hook 承接原 `ChatBox/index.tsx` 中的 auto resume effect。它只处理恢复生成：
 * - 判断当前会话是否需要恢复。
 * - 调用 `streamResumeFetch` 接收恢复流。
 * - 在本地补齐或复用 AI placeholder。
 * - 用调用方传入的 `generatingMessage` 复用现有 SSE 增量合并逻辑。
 * - 收尾同步当前 ChatBox 状态、侧边栏状态和已读状态。
 *
 * 输入约定：
 * - `generatingMessage` 仍由 ChatBox 提供，确保普通发送和恢复生成继续共享同一套
 *   answer/reasoning/tool/plan/interactive 合并逻辑。
 * - `activeAppIdRef/activeChatIdRef` 保存当前页面真实目标，用于防止恢复流异步返回后
 *   写入已经切走的会话。
 * - `resumedChatTargetRef` 记录本轮已经尝试恢复的 app/chat，避免同一个 generating
 *   会话在多次 render 后重复发起恢复请求。
 * - `resumeControllerRef` 写回当前恢复请求的 AbortController，让 `abortRequest('leave')`
 *   能在页面切换时中断恢复流。
 *
 * 关键边界：
 * - 只有 records 已加载、当前 ChatBox 数据和 runtime app/chat 对齐，并且状态仍为
 *   generating 时才恢复。
 * - 恢复流可能先到达 SSE 增量，再拿到完整 completedChat；因此需要按可见事件提前
 *   创建 AI placeholder，保证 `generatingMessage` 仍然只更新最后一条 AI 消息。
 * - 用户离开页面触发的 abort 不应把会话标记为 done/error，也不应弹出错误 toast。
 */
export const useChatResume = ({
  enableAutoResume,
  isReady,
  resumeTargetAiDataId,
  activeAppIdRef,
  activeChatIdRef,
  resumedChatTargetRef,
  resumeControllerRef,
  generatingMessage,
  scrollToBottom,
  finishChatGenerateStatus
}: UseChatResumeProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const appId = useContextSelector(WorkflowRuntimeContext, (v) => v.appId);
  const chatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);
  const chatBoxAppId = useContextSelector(ChatItemContext, (v) => v.chatBoxData.appId);
  const chatBoxChatId = useContextSelector(ChatItemContext, (v) => v.chatBoxData.chatId);
  const chatGenerateStatus = useContextSelector(
    ChatItemContext,
    (v) => v.chatBoxData.chatGenerateStatus
  );
  const isChatRecordsLoaded = useContextSelector(ChatRecordContext, (v) => v.isChatRecordsLoaded);
  const setChatRecords = useContextSelector(ChatRecordContext, (v) => v.setChatRecords);
  const isChatting = useContextSelector(ChatBoxContext, (v) => v.isChatting);

  useEffect(() => {
    if (
      !enableAutoResume ||
      !isReady ||
      !isChatRecordsLoaded ||
      !appId ||
      !chatId ||
      isChatting ||
      chatBoxAppId !== appId ||
      chatBoxChatId !== chatId ||
      chatGenerateStatus !== ChatGenerateStatusEnum.generating ||
      resumedChatTargetRef.current === `${appId}:${chatId}`
    ) {
      return;
    }

    resumedChatTargetRef.current = `${appId}:${chatId}`;

    const resumeForAppId = appId;
    const resumeForChatId = chatId;
    const responseChatId = resumeTargetAiDataId ?? getNanoid(24);
    const controller = new AbortController();
    resumeControllerRef.current = controller;
    scrollToBottom('auto');
    scrollToBottom('auto', 100);
    let resumeFinalStatus = ChatGenerateStatusEnum.done;
    let hasPreparedResumeAiRecord = false;
    let hasReceivedResumeOutput = false;

    const isActiveResumeTarget = ({ appId, chatId }: { appId: string; chatId: string }) =>
      activeAppIdRef.current === appId && activeChatIdRef.current === chatId;

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

    (async () => {
      try {
        const { responseText, completedChat, resumeUnavailable } = await streamResumeFetch({
          appId,
          chatId,
          outLinkAuthData,
          controller,
          onResumeUnavailable: () => {
            if (!isActiveResumeTarget({ appId: resumeForAppId, chatId: resumeForChatId })) return;
            resumeFinalStatus = ChatGenerateStatusEnum.generating;
            upsertResumeAiPlaceholder(
              responseChatId,
              getResumeUnavailablePlaceholderText(),
              ChatStatusEnum.loading
            );
          },
          onmessage: (message) => {
            if (!isActiveResumeTarget({ appId: resumeForAppId, chatId: resumeForChatId })) return;
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

        if (!isActiveResumeTarget({ appId: resumeForAppId, chatId: resumeForChatId })) return;

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
          resumeFinalStatus = ChatGenerateStatusEnum.generating;
          upsertResumeAiPlaceholder(
            responseChatId,
            getResumeUnavailablePlaceholderText(),
            ChatStatusEnum.loading
          );
          return;
        }

        setChatRecords((state) => {
          const currentLastItem = state[state.length - 1];
          if (
            currentLastItem?.dataId !== responseChatId ||
            currentLastItem.obj !== ChatRoleEnum.AI
          ) {
            return state;
          }

          const next = state.map((item, index) => {
            if (index !== state.length - 1) return item;
            return {
              ...item,
              status: ChatStatusEnum.finish,
              time: new Date(),
              responseData: mergeChatResponseData(item.responseData || [])
            };
          });

          const updatedLastItem = next[next.length - 1];
          if (
            updatedLastItem?.dataId === responseChatId &&
            !hasMeaningfulAiOutput(updatedLastItem as ChatSiteItemType) &&
            !responseText
          ) {
            return next.slice(0, -1);
          }

          return next;
        });
        scrollToBottom('auto');
      } catch (error) {
        if (controller.signal.aborted) return;
        if (!isActiveResumeTarget({ appId: resumeForAppId, chatId: resumeForChatId })) return;

        const isStreamError = (error as ResumeStreamErrorType | undefined)?.isStreamError === true;
        resumeFinalStatus = isStreamError
          ? ChatGenerateStatusEnum.error
          : ChatGenerateStatusEnum.done;

        setChatRecords((state) => {
          const currentLastItem = state[state.length - 1];
          if (
            currentLastItem?.dataId !== responseChatId ||
            currentLastItem.obj !== ChatRoleEnum.AI
          ) {
            return state;
          }

          const next = state.map((item, index) => {
            if (index !== state.length - 1) return item;
            return {
              ...item,
              status: ChatStatusEnum.finish,
              time: new Date()
            };
          });

          const updatedLastItem = next[next.length - 1];
          if (
            updatedLastItem?.dataId === responseChatId &&
            !hasMeaningfulAiOutput(updatedLastItem as ChatSiteItemType)
          ) {
            return next.slice(0, -1);
          }

          return next;
        });
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
          appId: resumeForAppId,
          chatId: resumeForChatId
        });
        const leftWhileResuming =
          controller.signal.aborted && isAbortByLeave(controller.signal.reason);

        if (leftWhileResuming) {
          return;
        }

        finishChatGenerateStatus({
          status: resumeFinalStatus,
          finishedInActiveChat,
          targetAppId: resumeForAppId,
          targetChatId: resumeForChatId
        });
      }
    })();
  }, [
    enableAutoResume,
    isReady,
    isChatRecordsLoaded,
    appId,
    chatId,
    isChatting,
    chatBoxAppId,
    chatBoxChatId,
    chatGenerateStatus,
    generatingMessage,
    outLinkAuthData,
    resumeTargetAiDataId,
    scrollToBottom,
    setChatRecords,
    finishChatGenerateStatus,
    t,
    toast,
    activeAppIdRef,
    activeChatIdRef,
    resumedChatTargetRef,
    resumeControllerRef
  ]);
};
