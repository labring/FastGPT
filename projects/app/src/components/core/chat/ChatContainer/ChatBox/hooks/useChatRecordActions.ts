import { useState } from 'react';
import { useContextSelector } from 'use-context-selector';
import { useMemoizedFn } from 'ahooks';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { delChatRecordById } from '@/web/core/chat/record/api';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { WorkflowRuntimeContext } from '../../context/workflowRuntimeContext';
import { formatChatValue2InputType } from '../utils/chatValue';
import type { ChatBoxInputType, SendPromptFnType } from '../type';

type UseChatRecordActionsProps = {
  sendPrompt: SendPromptFnType;
  onDeleteChatItem?: (contentId: string, delFile?: boolean) => Promise<void>;
};

/**
 * 管理 ChatBox 中“记录级动作”的副作用和本地 records 更新。
 *
 * 这里的“记录级动作”特指会直接改变 chatRecords 的删除、重试等操作：
 * - `retryInput` 会删除目标 human 消息及其后续记录，再用旧输入重新发送。
 * - `editInput` 会删除目标 human 消息及其后续记录，再用编辑后的文本重新发送。
 * - `delOneMessage` 会删除一条 human 消息，并顺带删除紧随其后的 AI 回复。
 * - `onDelMessage` 是 hook 内部的删除通道，优先走外部覆盖的 `onDeleteChatItem`，
 *   否则使用默认 `delChatRecordById` API，并自动带上当前 app/chat/outLink 鉴权信息。
 *
 * 设计边界：
 * - 本 hook 只处理删除和重试，不处理点赞、点踩、admin mark、log read status。
 *   这些反馈类动作会进入后续 `useChatFeedbackActions`，避免阶段四的单个 PR 过大。
 * - `sendPrompt` 由生成 hook 提供，本 hook 不关心普通发送的 placeholder、SSE 合并、
 *   TTS、问题引导等细节，只在重试时把恢复出的输入和裁剪后的 history 交还给生成链路。
 * - 本地 `chatRecords` 会先按现有逻辑乐观更新；远端删除失败时只对重试流程 toast，
 *   单条删除仍保持原来的 fire-and-forget 行为，不在本次拆分里改变用户可见语义。
 */
export const useChatRecordActions = ({
  sendPrompt,
  onDeleteChatItem
}: UseChatRecordActionsProps) => {
  const { toast } = useToast();
  const [isRecordActionLoading, setIsRecordActionLoading] = useState(false);

  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const setChatRecords = useContextSelector(ChatRecordContext, (v) => v.setChatRecords);
  const appId = useContextSelector(WorkflowRuntimeContext, (v) => v.appId);
  const chatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);

  /**
   * 删除一条服务端聊天记录。
   *
   * `delFile` 默认是 true，表示删除消息时一起删除关联文件；重试流程会传 false，
   * 因为同一轮历史可能需要继续复用原文件输入，不能在删除旧记录时把文件也删掉。
   */
  const onDelMessage = useMemoizedFn((contentId: string, delFile = true) => {
    if (onDeleteChatItem) {
      return onDeleteChatItem(contentId, delFile);
    }

    return delChatRecordById({
      appId,
      chatId,
      contentId,
      delFile,
      ...outLinkAuthData
    });
  });

  /**
   * 生成某条 human 消息的“重试”回调。
   *
   * 重试不是简单地重新发送当前文本，而是先定位目标 `dataId`：
   * 1. 删除该消息以及它之后的所有服务端记录，避免新回答和旧后续历史并存。
   * 2. 将本地 records 裁剪到目标消息之前，让生成链路看到正确的 history。
   * 3. 从被删除的第一条记录恢复 text/files，并交给 `sendPrompt` 重新发送。
   *
   * 如果没有传入 `dataId`，返回 undefined，让调用方不渲染无效动作。
   */
  const retryInput = useMemoizedFn((dataId?: string) => {
    if (!dataId) return;

    return async () => {
      setIsRecordActionLoading(true);
      const index = chatRecords.findIndex((item) => item.dataId === dataId);
      const delHistory = chatRecords.slice(index);

      try {
        await Promise.all(
          delHistory.map((item) => {
            if (item.dataId) {
              return onDelMessage(item.dataId, false);
            }
          })
        );
        setChatRecords((state) => (index === 0 ? [] : state.slice(0, index)));

        sendPrompt({
          ...formatChatValue2InputType(delHistory[0].value),
          history: chatRecords.slice(0, index)
        });
      } catch (error) {
        toast({
          status: 'warning',
          title: getErrText(error, 'Retry failed')
        });
      }
      setIsRecordActionLoading(false);
    };
  });

  /**
   * 生成某条 human 消息的“编辑后发送”回调。
   *
   * 编辑和重试的核心流程一致：先删除目标 human 消息及后续记录，再用裁剪前的 history
   * 重新发起一轮对话。text/files 使用编辑表单提交的新内容；删除旧记录时仍保留文件，
   * 避免编辑后的消息继续引用原附件或新附件时被提前清理。
   */
  const editInput = useMemoizedFn((dataId?: string) => {
    if (!dataId) return;

    return async (input: ChatBoxInputType) => {
      setIsRecordActionLoading(true);
      const index = chatRecords.findIndex((item) => item.dataId === dataId);
      const delHistory = chatRecords.slice(index);

      try {
        if (index < 0 || delHistory[0]?.obj !== ChatRoleEnum.Human) return;

        await Promise.all(
          delHistory.map((item) => {
            if (item.dataId) {
              return onDelMessage(item.dataId, false);
            }
          })
        );
        setChatRecords((state) => (index === 0 ? [] : state.slice(0, index)));

        sendPrompt({
          ...formatChatValue2InputType(delHistory[0].value),
          ...input,
          history: chatRecords.slice(0, index)
        });
      } catch (error) {
        toast({
          status: 'warning',
          title: getErrText(error, 'Edit failed')
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
   */
  const delOneMessage = useMemoizedFn((dataId: string) => {
    return () => {
      setChatRecords((state) => {
        let aiIndex = -1;

        return state.filter((chat, i) => {
          if (chat.dataId === dataId) {
            aiIndex = i + 1;
            onDelMessage(dataId);
            return false;
          } else if (aiIndex === i && chat.obj === ChatRoleEnum.AI && chat.dataId) {
            onDelMessage(chat.dataId);
            return false;
          }
          return true;
        });
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
