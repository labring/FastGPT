import type { ChatGenerateStatusChangeHandler } from '@/components/core/chat/ChatContainer/ChatBox/type';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { useMemoizedFn } from 'ahooks';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';

/**
 * 在 App/Share 页面层同步侧栏历史的生成状态。
 *
 * ChatBox / PluginRunBox 只通过 `onChatGenerateStatusChange` 抛出标准 source target 事件，不直接感知
 * ChatContext 或侧栏历史模型；页面层将 app 维度的状态事件转交给 ChatContext 统一维护。
 */
export const useAppChatGenerateStatusSync = (): ChatGenerateStatusChangeHandler => {
  const { t } = useTranslation();
  const chatTitle = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.title);
  const syncHistoryStatus = useContextSelector(ChatContext, (v) => v.syncHistoryStatus);

  return useMemoizedFn(({ sourceTarget, chatId, status, hasBeenRead, title }) => {
    if (sourceTarget.sourceType !== ChatSourceTypeEnum.app) return;

    const appId = sourceTarget.sourceId;
    if (!appId || !chatId) return;

    syncHistoryStatus({
      appId,
      chatId,
      status,
      hasBeenRead,
      title,
      fallbackTitle: chatTitle || t('common:core.chat.New Chat')
    });
  });
};
