import React, { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { createContext } from 'use-context-selector';
import { useLatest, useMemoizedFn } from 'ahooks';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { AdminFbkType } from '@fastgpt/global/core/chat/type';
import type { UpdateUserFeedbackBodyType } from '@fastgpt/global/openapi/core/chat/feedback/api';
import {
  closeCustomFeedback,
  updateChatAdminFeedback,
  updateChatUserFeedback,
  updateFeedbackReadStatus
} from '@/web/core/chat/feedback/api';
import type { ResolvedChatAuthTargetInput } from '@/web/core/chat/type';
import { hasChatAuthTargetInput } from '@/web/core/chat/utils';
import type { AdminMarkType } from '../ChatBox/components/SelectMarkCollection';
import { FeedbackTypeEnum } from '../ChatBox/constants';
import type { ChatSiteItemType } from '../ChatBox/type';

type AdminMarkState = AdminMarkType & { dataId: string };
type UserFeedbackInput = Pick<
  UpdateUserFeedbackBodyType,
  'dataId' | 'userGoodFeedback' | 'userBadFeedback'
>;

export type ChatFeedbackContextValue = {
  /** 显式启用的消息反馈类型，不限制版本卡片独立复用用户反馈操作。 */
  fbTypes: `${FeedbackTypeEnum}`[];
  active: boolean;
  feedbackUserName?: string;
  feedbackId?: string;
  setFeedbackId: React.Dispatch<React.SetStateAction<string | undefined>>;
  adminMarkData?: AdminMarkState;
  setAdminMarkData: React.Dispatch<React.SetStateAction<AdminMarkState | undefined>>;
  likeFeedbackEffect?: { dataId: string; trigger: number };
  pendingFeedbackIds: string[];
  onMark: (chat: ChatSiteItemType, content: { q: string; a: string }) => (() => void) | undefined;
  onAddUserLike: (chat: ChatSiteItemType) => (() => Promise<void>) | undefined;
  onAddUserDislike: (chat: ChatSiteItemType) => (() => void) | undefined;
  onCloseCustomFeedback: (
    chat: ChatSiteItemType,
    index: number
  ) => (event: ChangeEvent<HTMLInputElement>) => void;
  onToggleFeedbackReadStatus: (chat: ChatSiteItemType) => (() => Promise<void>) | undefined;
  onSubmitUserDislike: (content: string) => Promise<void>;
  onAdminMarkSuccess: (adminFeedback: AdminFbkType) => void;
};

type ChatFeedbackProviderProps = {
  children: React.ReactNode;
  fbTypes: `${FeedbackTypeEnum}`[];
  feedbackUserName?: string;
  /** 复用 ChatBox 的交互开关，旁观会话不提供用户反馈操作。 */
  active?: boolean;
  sourceKey: string;
  chatId: string;
  chatAuthTarget: ResolvedChatAuthTargetInput;
  setChatRecords: React.Dispatch<React.SetStateAction<ChatSiteItemType[]>>;
  onTriggerRefresh?: () => void;
};

export const ChatFeedbackContext = createContext<ChatFeedbackContextValue | undefined>(undefined);

/**
 * 统一管理聊天反馈、标注、已读操作和弹窗状态。
 * 会话鉴权与记录更新由 ChatBox 显式注入，不读取其他业务 Context；反馈请求与提示在此统一处理。
 * 用户反馈保存成功后才回写；请求按会话和消息去重，切换会话后忽略旧请求结果。
 * fbTypes 显式控制消息反馈；用户评价操作由 active 控制，供版本卡片独立复用。
 */
export const ChatFeedbackProvider = ({
  children,
  fbTypes,
  feedbackUserName,
  active = true,
  sourceKey,
  chatId,
  chatAuthTarget,
  setChatRecords,
  onTriggerRefresh
}: ChatFeedbackProviderProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const scopeKey = `${sourceKey}:${chatId}`;
  const canSubmit = !!chatId && hasChatAuthTargetInput(chatAuthTarget);
  const [feedbackId, setFeedbackId] = useState<string>();
  const [adminMarkData, setAdminMarkData] = useState<AdminMarkState>();
  const [likeFeedbackEffect, setLikeFeedbackEffect] =
    useState<ChatFeedbackContextValue['likeFeedbackEffect']>();
  const [pendingFeedbackIds, setPendingFeedbackIds] = useState<string[]>([]);
  const pendingFeedbackRef = useRef(new Set<string>());
  const likeFeedbackEffectTrigger = useRef(0);
  const likeFeedbackEffectTimer = useRef<ReturnType<typeof setTimeout>>();
  const latestScopeKey = useLatest(scopeKey);

  /** 取消赞或进入点踩流程时清理撒花，避免非点赞动作残留视觉反馈。 */
  const clearLikeFeedbackEffect = useMemoizedFn(() => {
    if (likeFeedbackEffectTimer.current) {
      clearTimeout(likeFeedbackEffectTimer.current);
      likeFeedbackEffectTimer.current = undefined;
    }
    setLikeFeedbackEffect(undefined);
  });

  useEffect(() => {
    // 会话切换后关闭旧弹窗，当前会话的提交锁与旧请求独立。
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset feedback UI at the conversation boundary
    setFeedbackId(undefined);
    setAdminMarkData(undefined);
    setPendingFeedbackIds([]);
    clearLikeFeedbackEffect();
    return () => {
      if (likeFeedbackEffectTimer.current) clearTimeout(likeFeedbackEffectTimer.current);
    };
  }, [scopeKey, clearLikeFeedbackEffect]);

  /** 成功写入后更新 AI 消息；同一会话中同一消息只允许一个用户反馈请求。 */
  const submitUserFeedback = useMemoizedFn(
    async ({
      dataId,
      userGoodFeedback,
      userBadFeedback,
      onSuccess
    }: UserFeedbackInput & { onSuccess: () => void }) => {
      const requestKey = `${scopeKey}:${dataId}`;
      if (!active || !dataId || !canSubmit || pendingFeedbackRef.current.has(requestKey)) return;

      const scope = scopeKey;
      pendingFeedbackRef.current.add(requestKey);
      setPendingFeedbackIds((state) => [...state, dataId]);
      try {
        await updateChatUserFeedback({
          ...chatAuthTarget,
          chatId,
          dataId,
          userGoodFeedback,
          userBadFeedback
        });
        if (latestScopeKey.current !== scope) return;

        setChatRecords((state) =>
          state.map((item) =>
            item.obj === ChatRoleEnum.AI && item.dataId === dataId
              ? {
                  ...item,
                  userGoodFeedback: userGoodFeedback ?? undefined,
                  userBadFeedback: userBadFeedback ?? undefined
                }
              : item
          )
        );
        onSuccess();
      } catch {
        if (latestScopeKey.current === scope) {
          toast({ status: 'error', title: t('common:core.chat.Feedback Failed') });
        }
      } finally {
        pendingFeedbackRef.current.delete(requestKey);
        if (latestScopeKey.current === scope) {
          setPendingFeedbackIds((state) => state.filter((id) => id !== dataId));
        }
      }
    }
  );

  /** 已有标注进入编辑态，否则使用调用方提供的上一问和当前回答作为默认内容。 */
  const onMark = useMemoizedFn((chat: ChatSiteItemType, { q, a }: { q: string; a: string }) => {
    if (!fbTypes.includes(FeedbackTypeEnum.mark) || chat.obj !== ChatRoleEnum.AI) return;

    return () => {
      if (!chat.dataId) return;

      setAdminMarkData(
        chat.adminFeedback
          ? { ...chat.adminFeedback, dataId: chat.dataId, q: chat.adminFeedback.q || q }
          : { dataId: chat.dataId, q, a }
      );
    };
  });

  /** 点赞与点踩互斥；再次点击取消点赞，只有成功新增点赞时触发撒花。 */
  const onAddUserLike = useMemoizedFn((chat: ChatSiteItemType) => {
    if (!active || chat.obj !== ChatRoleEnum.AI) return;

    return () =>
      submitUserFeedback({
        dataId: chat.dataId,
        userGoodFeedback: chat.userGoodFeedback ? undefined : 'yes',
        onSuccess: () => {
          if (chat.userGoodFeedback) return clearLikeFeedbackEffect();

          const trigger = ++likeFeedbackEffectTrigger.current;
          if (likeFeedbackEffectTimer.current) clearTimeout(likeFeedbackEffectTimer.current);
          setLikeFeedbackEffect({ dataId: chat.dataId, trigger });
          likeFeedbackEffectTimer.current = setTimeout(() => {
            setLikeFeedbackEffect((state) => (state?.trigger === trigger ? undefined : state));
          }, 800);
        }
      });
  });

  /** 已有点踩时直接取消，否则先打开原因弹窗，关闭弹窗不修改已保存的反馈。 */
  const onAddUserDislike = useMemoizedFn((chat: ChatSiteItemType) => {
    if (!active || chat.obj !== ChatRoleEnum.AI) return;

    if (chat.userBadFeedback) {
      return () => submitUserFeedback({ dataId: chat.dataId, onSuccess: clearLikeFeedbackEffect });
    }

    return () => {
      if (
        !chat.dataId ||
        !canSubmit ||
        pendingFeedbackRef.current.has(`${scopeKey}:${chat.dataId}`)
      )
        return;
      clearLikeFeedbackEffect();
      setFeedbackId(chat.dataId);
    };
  });

  /** 点踩弹窗只收集原因，保存和消息回写统一复用 Provider 的提交与隔离逻辑。 */
  const onSubmitUserDislike = useMemoizedFn(async (content: string) => {
    if (!feedbackId || !active) return;

    const submittedFeedbackId = feedbackId;
    await submitUserFeedback({
      dataId: submittedFeedbackId,
      userBadFeedback: content,
      onSuccess: () => {
        clearLikeFeedbackEffect();
        // 提交期间可能已打开另一条消息的反馈，只关闭本次提交对应的弹窗。
        setFeedbackId((currentId) => (currentId === submittedFeedbackId ? undefined : currentId));
        toast({ status: 'success', title: t('common:core.chat.Feedback Success') });
      }
    });
  });

  /** 勾选后关闭指定自定义反馈，保留原有按索引删除和本地即时更新的行为。 */
  const onCloseCustomFeedback = useMemoizedFn((chat: ChatSiteItemType, index: number) => {
    return (event: ChangeEvent<HTMLInputElement>) => {
      if (
        !fbTypes.includes(FeedbackTypeEnum.custom) ||
        !event.target.checked ||
        !canSubmit ||
        !chat.dataId
      )
        return;

      void closeCustomFeedback({ ...chatAuthTarget, chatId, dataId: chat.dataId, index });
      setChatRecords((state) =>
        state.map((item) =>
          item.obj === ChatRoleEnum.AI && item.dataId === chat.dataId
            ? { ...item, customFeedbacks: item.customFeedbacks?.filter((_, i) => i !== index) }
            : item
        )
      );
    };
  });

  /** 日志反馈的已读状态保存成功后再回写，并通知外层刷新统计。 */
  const onToggleFeedbackReadStatus = useMemoizedFn((chat: ChatSiteItemType) => {
    if (!fbTypes.includes(FeedbackTypeEnum.log) || chat.obj !== ChatRoleEnum.AI) return;

    return async () => {
      if (!canSubmit || !chat.dataId) return;
      const scope = scopeKey;
      const isRead = !chat.isFeedbackRead;

      try {
        await updateFeedbackReadStatus({ ...chatAuthTarget, chatId, dataId: chat.dataId, isRead });
        if (latestScopeKey.current !== scope) return;

        setChatRecords((state) =>
          state.map((item) =>
            item.obj === ChatRoleEnum.AI && item.dataId === chat.dataId
              ? { ...item, isFeedbackRead: isRead }
              : item
          )
        );
        onTriggerRefresh?.();
      } catch {}
    };
  });

  /** 数据集标注成功后同步反馈接口，并更新所属消息的标注展示。 */
  const onAdminMarkSuccess = useMemoizedFn((adminFeedback: AdminFbkType) => {
    if (!fbTypes.includes(FeedbackTypeEnum.mark) || !canSubmit || !adminMarkData?.dataId) return;

    void updateChatAdminFeedback({
      ...chatAuthTarget,
      chatId,
      dataId: adminMarkData.dataId,
      ...adminFeedback
    });
    setChatRecords((state) =>
      state.map((item) =>
        item.obj === ChatRoleEnum.AI && item.dataId === adminMarkData.dataId
          ? { ...item, adminFeedback }
          : item
      )
    );
  });

  return (
    <ChatFeedbackContext.Provider
      value={{
        fbTypes,
        active,
        feedbackUserName,
        feedbackId,
        setFeedbackId,
        adminMarkData,
        setAdminMarkData,
        likeFeedbackEffect,
        pendingFeedbackIds,
        onMark,
        onAddUserLike,
        onAddUserDislike,
        onCloseCustomFeedback,
        onToggleFeedbackReadStatus,
        onSubmitUserDislike,
        onAdminMarkSuccess
      }}
    >
      {children}
    </ChatFeedbackContext.Provider>
  );
};
