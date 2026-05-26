import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { WorkflowRuntimeContext } from '../../context/workflowRuntimeContext';
import { useContextSelector } from 'use-context-selector';
import { useTranslation } from 'next-i18next';
import { useMemoizedFn } from 'ahooks';

/**
 * 同步侧边栏历史会话的生成状态。
 *
 * ChatBox 内部会同时维护当前会话详情和左侧历史列表。发送、恢复生成完成或失败时，
 * 当前 `chatBoxData.chatGenerateStatus` 会更新，但侧边栏历史列表也需要同步展示
 * generating/done/error 和已读状态。
 *
 * 这个 hook 只处理侧边栏历史列表，不直接修改当前 ChatBox 数据：
 * - 当前会话详情由调用方通过 `setChatBoxData` 更新。
 * - 历史列表由这里通过 `setHistories` 局部更新。
 * - 当历史列表里找不到目标会话时，先补一条本地历史，并异步触发 `loadHistories`
 *   让服务端数据随后校准。
 *
 * 输入约定：
 * - 默认同步当前 runtime 的 `appId/chatId`。
 * - 恢复生成可能在异步完成时已经切换页面，因此允许通过 `targetAppId/targetChatId`
 *   明确指定要同步的历史项。
 *
 * 边界行为：
 * - 如果目标 app 已不是当前 app，直接跳过，避免跨 app 把历史状态写错。
 * - `hasBeenRead` 未显式传入时，只有 generating 默认未读，其它状态默认已读。
 */
export const useSidebarChatGenerateStatus = () => {
  const { t } = useTranslation();
  const appId = useContextSelector(WorkflowRuntimeContext, (v) => v.appId);
  const chatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const chatTitle = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.title);
  const setHistories = useContextSelector(ChatContext, (v) => v.setHistories);
  const loadHistories = useContextSelector(ChatContext, (v) => v.loadHistories);

  return useMemoizedFn(
    (
      status: ChatGenerateStatusEnum,
      options?: {
        hasBeenRead?: boolean;
        targetAppId?: string;
        targetChatId?: string;
        title?: string;
      }
    ) => {
      const targetAppId = options?.targetAppId ?? appId;
      if (targetAppId !== appId) return;

      const targetChatId = options?.targetChatId ?? chatId;
      if (!targetChatId) return;

      setHistories((prev) => {
        const idx = prev.findIndex((h) => h.chatId === targetChatId && h.appId === targetAppId);

        if (idx === -1) {
          queueMicrotask(loadHistories);
          return [
            {
              chatId: targetChatId,
              appId: targetAppId,
              title: options?.title || chatTitle || t('common:core.chat.New Chat'),
              customTitle: '',
              top: false,
              updateTime: new Date(),
              chatGenerateStatus: status,
              hasBeenRead: options?.hasBeenRead ?? status !== ChatGenerateStatusEnum.generating
            },
            ...prev
          ];
        }

        return prev.map((h) =>
          h.chatId === targetChatId && h.appId === targetAppId
            ? {
                ...h,
                chatGenerateStatus: status,
                updateTime: new Date(),
                ...(options?.hasBeenRead !== undefined ? { hasBeenRead: options.hasBeenRead } : {})
              }
            : h
        );
      });
    }
  );
};
