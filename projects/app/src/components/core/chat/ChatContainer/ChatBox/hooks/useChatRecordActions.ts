import { useState } from 'react';
import { useContextSelector } from 'use-context-selector';
import { useMemoizedFn } from 'ahooks';
import { useTranslation } from 'react-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { delChatRecordById, getChatRecords } from '@/web/core/chat/record/api';
import type {
  ChatItemMiniType,
  UserChatInteractiveReplyType
} from '@fastgpt/global/core/chat/type';
import { resetDeletedInteractiveReply } from '@fastgpt/global/core/chat/utils';
import { extractDeepestInteractive } from '@fastgpt/global/core/workflow/runtime/utils';
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
 *   这些反馈类动作会进入后续 `useChatFeedbackActions`，避免阶段四的单个 PR 过大。
 * - `sendPrompt` 由生成 hook 提供，本 hook 不关心普通发送的 placeholder、SSE 合并、
 *   TTS、问题引导等细节，只在重试时把恢复出的输入和裁剪后的 history 交还给生成链路。
 * - 本地 `chatRecords` 会先按现有逻辑乐观更新；远端删除失败时只对重试流程 toast，
 *   单条删除仍保持原来的 fire-and-forget 行为，不在本次拆分里改变用户可见语义。
 */
export const useChatRecordActions = ({ sendPrompt }: UseChatRecordActionsProps) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isRecordActionLoading, setIsRecordActionLoading] = useState(false);

  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const setChatRecords = useContextSelector(ChatRecordContext, (v) => v.setChatRecords);
  const refreshChatRecords = useContextSelector(ChatRecordContext, (v) => v.refreshChatRecords);
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

  /**
   * 生成某条 human 消息的“重试”回调。
   *
   * 重试不是简单地重新发送当前文本，而是先定位目标 `dataId`：
   * 1. 删除该消息以及它之后的所有服务端记录，避免新回答和旧后续历史并存。
   * 2. 重新加载删除后的历史窗口及分页锚点，避免继续用已删除的消息查询上下页。
   * 3. 从被删除的第一条记录恢复 text/files，并交给 `sendPrompt` 重新发送。
   *
   * 如果没有传入 `dataId`，返回 undefined，让调用方不渲染无效动作。
   */
  const retryInput = useMemoizedFn((dataId?: string, hideInUI = false) => {
    if (!dataId) return;

    return async () => {
      setIsRecordActionLoading(true);
      const index = chatRecords.findIndex((item) => item.dataId === dataId);
      const delHistory = chatRecords.slice(index);

      try {
        const user = delHistory[0];
        if (index < 0 || user?.obj !== ChatRoleEnum.Human) return;
        const history = chatRecords.slice(0, index);
        const reply = user.value.find((value) => value.interactiveReply)?.interactiveReply;

        // 重试问答要恢复原交互；Preview 还需保留 confirm/revise/cancel，避免确认被当成修改建议。
        const interactive = await (async () => {
          if (!reply) return;
          const findInteractive = (histories: ChatItemMiniType[]) => {
            for (const item of [...histories].reverse()) {
              if (item.obj !== ChatRoleEnum.AI) continue;
              for (const value of [...item.value].reverse()) {
                const source = value.interactive;
                if (!source) continue;
                const final = extractDeepestInteractive(source);
                if (
                  (reply.type === 'agentAsk' &&
                    final.type === 'agentAsk' &&
                    final.askId === reply.interactionId) ||
                  (reply.type === 'workflowBuilderPreview' &&
                    final.type === 'workflowBuilderPreview' &&
                    final.previewId === reply.interactionId)
                )
                  return source;
              }
            }
          };
          const existing = findInteractive(history);
          if (existing) return existing;

          // 分页边界可能只有 user 记录；在删除前取回其前一轮 AI，禁止猜测交互参数。
          const previous = await getChatRecords({
            ...chatAuthTarget,
            chatId,
            prevId: dataId,
            pageSize: 2
          });
          const restored = findInteractive(previous.list);
          if (!restored) throw new Error('Interactive message not found');
          return restored;
        })();
        const finalInteractive = interactive ? extractDeepestInteractive(interactive) : undefined;
        const agentPlanAskResponse = (() => {
          if (finalInteractive?.type !== 'workflowBuilderPreview') return;
          if (!finalInteractive.params.answerValue)
            throw new Error('Workflow preview response not found');
          return {
            askId: finalInteractive.previewId,
            optionValue: finalInteractive.params.answerValue,
            text: finalInteractive.params.answerText
          };
        })();

        await onDelMessages(delHistory.map((item) => item.dataId));
        const refreshedHistory = await refreshChatRecords();

        sendPrompt({
          ...formatChatValue2InputType(user.value),
          hideInUI: hideInUI || user.hideInUI,
          history: refreshedHistory,
          interactive,
          agentPlanAskResponse
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

        await onDelMessages(delHistory.map((item) => item.dataId));
        const history = await refreshChatRecords();

        sendPrompt({
          ...formatChatValue2InputType(delHistory[0].value),
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
   */
  const delOneMessage = useMemoizedFn((dataId: string) => {
    return () => {
      setChatRecords((state) => {
        let aiIndex = -1;
        const deletedDataIds: string[] = [];
        const replies: UserChatInteractiveReplyType[] = [];

        const nextState = state.filter((chat, i) => {
          if (chat.dataId === dataId) {
            if (chat.obj === ChatRoleEnum.Human)
              chat.value.forEach((value) => {
                if (value.interactiveReply) replies.push(value.interactiveReply);
              });
            aiIndex = i + 1;
            deletedDataIds.push(dataId);
            return false;
          } else if (aiIndex === i && chat.obj === ChatRoleEnum.AI && chat.dataId) {
            deletedDataIds.push(chat.dataId);
            return false;
          }
          return true;
        });

        // 与服务端软删除同步恢复末轮问题，删除回答后立即重新显示底部提问框。
        const previousAiIndex = nextState.findLastIndex(
          (item) => item.obj === ChatRoleEnum.AI && !item.deleteTime
        );
        const previousAi = nextState[previousAiIndex];
        if (previousAi?.obj === ChatRoleEnum.AI && replies.length > 0) {
          const lastValue = previousAi.value.at(-1);
          const interactive = lastValue?.interactive
            ? structuredClone(lastValue.interactive)
            : undefined;
          if (interactive && resetDeletedInteractiveReply({ interactive, replies })) {
            nextState[previousAiIndex] = {
              ...previousAi,
              value: [...previousAi.value.slice(0, -1), { ...lastValue, interactive }]
            };
          }
        }

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
