import { useState, type ChangeEvent } from 'react';
import { useContextSelector } from 'use-context-selector';
import { useMemoizedFn } from 'ahooks';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { AdminFbkType } from '@fastgpt/global/core/chat/type';
import {
  closeCustomFeedback,
  updateChatAdminFeedback,
  updateChatUserFeedback,
  updateFeedbackReadStatus
} from '@/web/core/chat/feedback/api';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { WorkflowRuntimeContext } from '../../context/workflowRuntimeContext';
import type { AdminMarkType } from '../components/SelectMarkCollection';
import { ChatTypeEnum, FeedbackTypeEnum } from '../constants';
import { formatChatValue2InputType } from '../utils/chatValue';
import type { ChatSiteItemType } from '../type';

type UseChatFeedbackActionsProps = {
  feedbackType?: `${FeedbackTypeEnum}`;
  showMarkIcon: boolean;
  chatType: `${ChatTypeEnum}`;
  onTriggerRefresh?: () => void;
};

type AdminMarkState = AdminMarkType & { dataId: string };

/**
 * 管理 ChatBox 中反馈、标注和反馈已读状态相关动作。
 *
 * 这组逻辑和 PR 5 的 record actions 不同：它不会删除或重试消息，而是修改消息上的
 * feedback 字段、custom feedback 列表、admin mark 数据以及 log 模式的反馈已读状态。
 *
 * 设计边界：
 * - hook 负责动作和 modal 状态，`FeedbackModal`、`SelectMarkCollection` 的 JSX 仍留在
 *   `ChatBox/index.tsx`，避免本 PR 同时进入 UI 组件拆分。
 * - 用户点赞/取消点赞、点踩/取消点踩、关闭 custom feedback 都沿用原来的乐观更新策略：
 *   先更新本地 `chatRecords`，API 异常保持静默，不在本次拆分里新增 toast 或回滚。
 * - admin mark 的弹窗流程需要跨三步选择 dataset、collection、输入数据，因此 hook 只保存
 *   当前 modal 数据和 success 回写逻辑，不改 `SelectMarkCollection` 内部交互。
 */
export const useChatFeedbackActions = ({
  feedbackType,
  showMarkIcon,
  chatType,
  onTriggerRefresh
}: UseChatFeedbackActionsProps) => {
  const [feedbackId, setFeedbackId] = useState<string>();
  const [adminMarkData, setAdminMarkData] = useState<AdminMarkState>();

  const setChatRecords = useContextSelector(ChatRecordContext, (v) => v.setChatRecords);
  const appId = useContextSelector(WorkflowRuntimeContext, (v) => v.appId);
  const chatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);

  /**
   * 生成 admin mark 入口回调。
   *
   * 只有开启 `showMarkIcon` 且目标消息是 AI 时才允许标注。已有 adminFeedback 时进入编辑态，
   * 会带回原 dataset/collection/dataId；没有 adminFeedback 时用上一条 human 文本作为 q，
   * 用当前 AI 文本作为 a，保持原来的默认标注内容。
   */
  const onMark = useMemoizedFn((chat: ChatSiteItemType, q = '') => {
    if (!showMarkIcon || chat.obj !== ChatRoleEnum.AI) return;

    return () => {
      if (!chat.dataId) return;

      if (chat.adminFeedback) {
        setAdminMarkData({
          dataId: chat.dataId,
          datasetId: chat.adminFeedback.datasetId,
          collectionId: chat.adminFeedback.collectionId,
          feedbackDataId: chat.adminFeedback.feedbackDataId,
          q: chat.adminFeedback.q || q || '',
          a: chat.adminFeedback.a
        });
      } else {
        setAdminMarkData({
          dataId: chat.dataId,
          q,
          a: formatChatValue2InputType(chat.value).text
        });
      }
    };
  });

  /**
   * 生成用户点赞回调。
   *
   * 点赞只在 user feedback 模式和 AI 消息下可用。点赞与点踩互斥：点亮赞时清空踩，
   * 再次点击已点赞消息会取消 `userGoodFeedback`，保留原有“点击切换”语义。
   */
  const onAddUserLike = useMemoizedFn((chat: ChatSiteItemType) => {
    if (feedbackType !== FeedbackTypeEnum.user || chat.obj !== ChatRoleEnum.AI) return;

    return () => {
      if (!chat.dataId || !chatId || !appId) return;

      const isGoodFeedback = !!chat.userGoodFeedback;
      setChatRecords((state) =>
        state.map((chatItem) =>
          chatItem.dataId === chat.dataId
            ? {
                ...chatItem,
                userGoodFeedback: isGoodFeedback ? undefined : 'yes',
                userBadFeedback: undefined
              }
            : chatItem
        )
      );

      try {
        updateChatUserFeedback({
          appId,
          chatId,
          dataId: chat.dataId,
          userGoodFeedback: isGoodFeedback ? undefined : 'yes',
          ...outLinkAuthData
        });
      } catch {}
    };
  });

  /**
   * 生成用户点踩回调。
   *
   * 没有点踩内容时返回打开 `FeedbackModal` 的回调，由弹窗收集具体原因；已有点踩内容时返回
   * 取消点踩回调，清空本地 `userBadFeedback` 并同步服务端。点赞与点踩互斥，
   * 点踩提交成功后会清空本地 `userGoodFeedback`。
   */
  const onAddUserDislike = useMemoizedFn((chat: ChatSiteItemType) => {
    if (feedbackType !== FeedbackTypeEnum.user || chat.obj !== ChatRoleEnum.AI) return;

    if (chat.userBadFeedback) {
      return () => {
        if (!chat.dataId || !chatId || !appId) return;
        setChatRecords((state) =>
          state.map((chatItem) =>
            chatItem.dataId === chat.dataId ? { ...chatItem, userBadFeedback: undefined } : chatItem
          )
        );

        try {
          updateChatUserFeedback({
            appId,
            chatId,
            dataId: chat.dataId,
            ...outLinkAuthData
          });
        } catch {}
      };
    }

    return () => setFeedbackId(chat.dataId);
  });

  /**
   * 生成关闭 custom feedback 的 checkbox change 回调。
   *
   * 原逻辑只在 checkbox 被勾选时关闭指定 custom feedback；这里保持同样的 DOM 驱动语义。
   * 服务端通过 index unset/pull，本地则过滤同一 index，避免关闭后仍在当前消息下展示。
   */
  const onCloseCustomFeedback = useMemoizedFn((chat: ChatSiteItemType, i: number) => {
    return (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.checked && appId && chatId && chat.dataId) {
        closeCustomFeedback({
          appId,
          chatId,
          dataId: chat.dataId,
          index: i
        });

        setChatRecords((state) =>
          state.map((chatItem) =>
            chatItem.obj === ChatRoleEnum.AI && chatItem.dataId === chat.dataId
              ? {
                  ...chatItem,
                  customFeedbacks: chatItem.customFeedbacks?.filter((_, index) => index !== i)
                }
              : chatItem
          )
        );
      }
    };
  });

  /**
   * 生成 log 模式下反馈已读状态切换回调。
   *
   * 该动作只对 log 模式 AI 消息生效。成功写入服务端后再更新本地 `isFeedbackRead`，
   * 并触发 `onTriggerRefresh` 刷新外层统计，保持原有“服务端成功后同步 UI”的行为。
   */
  const onToggleFeedbackReadStatus = useMemoizedFn((chat: ChatSiteItemType) => {
    if (chatType !== ChatTypeEnum.log || chat.obj !== ChatRoleEnum.AI) return;

    return async () => {
      if (!appId || !chatId || !chat.dataId) return;

      const newReadStatus = !chat.isFeedbackRead;

      try {
        await updateFeedbackReadStatus({
          appId,
          chatId,
          dataId: chat.dataId,
          isRead: newReadStatus
        });

        setChatRecords((state) =>
          state.map((item) =>
            item.dataId === chat.dataId
              ? {
                  ...item,
                  isFeedbackRead: newReadStatus
                }
              : item
          )
        );

        onTriggerRefresh?.();
      } catch {}
    };
  });

  /**
   * FeedbackModal 提交成功后的本地回写。
   *
   * 点踩具体内容由 modal 内部提交到服务端；ChatBox 只需要把成功返回的内容写回当前消息，
   * 并关闭 modal，避免等待下一次 records reload 才看到反馈状态。
   */
  const onFeedbackSuccess = useMemoizedFn((content: string) => {
    setChatRecords((state) =>
      state.map((item) =>
        item.dataId === feedbackId
          ? { ...item, userGoodFeedback: undefined, userBadFeedback: content }
          : item
      )
    );
    setFeedbackId(undefined);
  });

  /**
   * SelectMarkCollection 提交成功后的服务端同步和本地回写。
   *
   * `adminMarkData.dataId` 是当前被标注的 AI 消息 id；如果基础上下文缺失则直接跳过，
   * 和原实现一致，不额外弹错。成功后把完整 adminFeedback 写回本地消息用于即时展示。
   */
  const onAdminMarkSuccess = useMemoizedFn((adminFeedback: AdminFbkType) => {
    if (!appId || !chatId || !adminMarkData?.dataId) return;

    updateChatAdminFeedback({
      appId,
      chatId,
      dataId: adminMarkData.dataId,
      ...adminFeedback
    });

    setChatRecords((state) =>
      state.map((chatItem) =>
        chatItem.dataId === adminMarkData.dataId
          ? {
              ...chatItem,
              adminFeedback
            }
          : chatItem
      )
    );
  });

  return {
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
  };
};
