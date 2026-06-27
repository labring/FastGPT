import type { ChatGenerateStatusChangeHandler } from '@/components/core/chat/ChatContainer/ChatBox/type';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { ChatGenerateStatusEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { useMemoizedFn } from 'ahooks';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';

/**
 * 在 App/Share 页面层同步侧栏历史的生成状态。
 *
 * ChatBox 只通过 `onChatGenerateStatusChange` 抛出标准 source target 事件，不直接感知
 * ChatContext 或侧栏历史模型；页面层根据自己的外部状态结构决定如何消费这个事件。
 */
export const useAppChatGenerateStatusSync = (): ChatGenerateStatusChangeHandler => {
  const { t } = useTranslation();
  const chatTitle = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.title);
  const setHistories = useContextSelector(ChatContext, (v) => v.setHistories);
  const loadHistories = useContextSelector(ChatContext, (v) => v.loadHistories);

  return useMemoizedFn(({ sourceTarget, chatId, status, hasBeenRead, title }) => {
    if (sourceTarget.sourceType !== ChatSourceTypeEnum.app) return;

    const appId = sourceTarget.sourceId;
    if (!appId || !chatId) return;

    setHistories((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.chatId === chatId && item.appId === appId
      );
      const nextHasBeenRead = hasBeenRead ?? status !== ChatGenerateStatusEnum.generating;

      if (existingIndex === -1) {
        queueMicrotask(loadHistories);
        return [
          {
            chatId,
            appId,
            title: title || chatTitle || t('common:core.chat.New Chat'),
            customTitle: '',
            top: false,
            updateTime: new Date(),
            chatGenerateStatus: status,
            hasBeenRead: nextHasBeenRead
          },
          ...prev
        ];
      }

      return prev.map((item, index) =>
        index === existingIndex
          ? {
              ...item,
              ...(title ? { title } : {}),
              chatGenerateStatus: status,
              updateTime: new Date(),
              ...(hasBeenRead !== undefined ? { hasBeenRead } : {})
            }
          : item
      );
    });
  });
};
