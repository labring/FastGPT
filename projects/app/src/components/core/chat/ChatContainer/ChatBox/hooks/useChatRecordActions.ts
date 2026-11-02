import { useState } from 'react';
import { useContextSelector } from 'use-context-selector';
import { useMemoizedFn } from 'ahooks';
import { useTranslation } from 'react-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { getUserChatSelect } from '@fastgpt/global/core/chat/input/utils';
import { delChatRecordById } from '@/web/core/chat/record/api';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { WorkflowRuntimeContext } from '../../context/workflowRuntimeContext';
import { formatChatValue2InputType } from '../utils/chatValue';
import type { ChatBoxInputType, SendPromptFnType } from '../type';
import { useChatAuthApiTarget } from '@/web/core/chat/utils';

type UseChatRecordActionsProps = {
  sendPrompt: SendPromptFnType;
};

const uniqueDataIds = (dataIds: Array<string | undefined>) =>
  Array.from(new Set(dataIds.filter((dataId): dataId is string => !!dataId)));

/**
 * 管理 ChatBox 中“记录级动作”的副作用和本地 records 更新。
 *
 * 这里的“记录级动作”特指会直接改变 chatRecords 的删除、重试等操作：
 * - `retryInput` 会删除目标 human 消息及其后续记录，再用旧输入重新发送。
 * - `editInput` 会删除目标 human 消息及其后续记录，再用编辑后的文本重新发送。
 * - `delOneMessage` 会删除一条 human 消息，并顺带删除紧随其后的 AI 回复。
 * - `onDelMessages` 是 hook 内部的删除通道，统一使用标准 `delChatRecordById` API，
 *   并自动带上当前 chat target、chatId 和外链鉴权信息。
 *
 * 设计边界：
 * - 本 hook 只处理删除和重试，不处理点赞、点踩、admin mark、log read status。
 *   这些反馈类动作由 `ChatFeedbackProvider` 统一管理。
 * - `sendPrompt` 由生成 hook 提供，本 hook 不关心普通发送的 placeholder、SSE 合并、
 *   TTS、问题引导等细节，只在重试时把恢复出的输入和裁剪后的 history 交还给生成链路。
 * - 重试和编辑先确认远端删除成功，再裁剪本地窗口；失败时保留原记录并提示。
 *   单条删除仍沿用乐观更新和 fire-and-forget 行为。
 */
export const useChatRecordActions = ({ sendPrompt }: UseChatRecordActionsProps) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isRecordActionLoading, setIsRecordActionLoading] = useState(false);

  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const setChatRecords = useContextSelector(ChatRecordContext, (v) => v.setChatRecords);
  const truncateChatRecords = useContextSelector(ChatRecordContext, (v) => v.truncateChatRecords);
  const sourceTarget = useContextSelector(WorkflowRuntimeContext, (v) => v.sourceTarget);
  const chatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);
  const chatAuthTarget = useChatAuthApiTarget({ sourceTarget, outLinkAuthData });

  /**
   * 删除一组服务端聊天记录。
   *
   * 这里只软删除 chat item 记录；聊天附件由 chat 级资源清理流程统一回收，避免单条消息删除
   * 误删后续重试、编辑流程仍可能复用的文件。
   */
  const onDelMessages = useMemoizedFn((contentIds: string[]) => {
    const targetContentIds = uniqueDataIds(contentIds);
    if (targetContentIds.length === 0) return Promise.resolve();

    return delChatRecordById({
      ...chatAuthTarget,
      chatId,
      contentIds: targetContentIds
    });
  });

  /** 重试和编辑共用删除入口；记录 Context 决定本地裁剪或补回缺失的历史窗口。 */
  const deleteHistoryFrom = useMemoizedFn(async (index: number) => {
    await onDelMessages(chatRecords.slice(index).map((item) => item.dataId));
    return truncateChatRecords(chatRecords[index].dataId);
  });

  /**
   * 生成某条 human 消息的“重试”回调。
   *
   * 按目标 `dataId` 裁剪该条及后续消息，再原样重发输入：
   * 1. 保存目标 user 的 text/files/select，裁剪该消息及后续记录。
   * 2. 删除成功后裁剪本地窗口和分页锚点，缺少前文时再补拉历史。
   * 3. 原样重发结构化输入；不补查原问题、不回写旧 AI。
   *
   * 如果没有传入 `dataId`，返回 undefined，让调用方不渲染无效动作。
   */
  const retryInput = useMemoizedFn((dataId?: string, hideInUI = false) => {
    if (!dataId) return;

    return async () => {
      setIsRecordActionLoading(true);
      const index = chatRecords.findIndex((item) => item.dataId === dataId);
      const user = chatRecords[index];

      try {
        if (index < 0 || user?.obj !== ChatRoleEnum.Human) return;
        const history = await deleteHistoryFrom(index);

        sendPrompt({
          ...formatChatValue2InputType(user.value),
          hideInUI: hideInUI || user.hideInUI,
          history
        });
      } catch (error) {
        toast({
          status: 'warning',
          title: t(getErrText(error, 'Retry failed'))
        });
      } finally {
        setIsRecordActionLoading(false);
      }
    };
  });

  /**
   * 生成某条 human 消息的“编辑后发送”回调。
   *
   * 结构化 Ask/Preview 回复没有普通文本编辑器，不提供编辑回调。普通消息先删除目标及
   * 后续记录，再用编辑后的 text/files 和剩余 history 发起对话；保留原附件供复用。
   */
  const editInput = useMemoizedFn((dataId?: string) => {
    if (!dataId) return;
    const user = chatRecords.find((item) => item.dataId === dataId);
    if (user?.obj !== ChatRoleEnum.Human || getUserChatSelect(user.value)) return;

    return async (input: ChatBoxInputType) => {
      setIsRecordActionLoading(true);
      const index = chatRecords.findIndex((item) => item.dataId === dataId);
      const currentUser = chatRecords[index];

      try {
        if (index < 0 || currentUser?.obj !== ChatRoleEnum.Human) return;

        const history = await deleteHistoryFrom(index);

        sendPrompt({
          ...formatChatValue2InputType(currentUser.value),
          ...input,
          history
        });
      } catch (error) {
        toast({
          status: 'warning',
          title: t(getErrText(error, 'Edit failed'))
        });
      } finally {
        setIsRecordActionLoading(false);
      }
    };
  });

  /**
   * 生成单条 human 消息的删除回调。
   *
   * ChatBox 的一轮普通对话通常是 human 后面紧跟 AI 回复，因此删除 human 时需要同步删除
   * 紧随其后的 AI 记录，避免界面只剩下一条失去问题上下文的回答。这里只删除“紧随其后”
   * 且仍有 `dataId` 的 AI，避免误删更远处的历史或还未落库的临时消息。
   * 删除末轮回答及 AI 后，底部输入由剩余的末轮 Ask/Preview 自然恢复。
   */
  const delOneMessage = useMemoizedFn((dataId: string) => {
    return () => {
      setChatRecords((state) => {
        let aiIndex = -1;
        const deletedDataIds: string[] = [];
        const nextState = state.filter((chat, i) => {
          if (chat.dataId === dataId) {
            aiIndex = i + 1;
            deletedDataIds.push(dataId);
            return false;
          } else if (aiIndex === i && chat.obj === ChatRoleEnum.AI && chat.dataId) {
            deletedDataIds.push(chat.dataId);
            return false;
          }
          return true;
        });

        void onDelMessages(deletedDataIds);
        return nextState;
      });
    };
  });

  return {
    isRecordActionLoading,
    retryInput,
    editInput,
    delOneMessage
  };
};
