import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatHistoryItemType } from '@fastgpt/global/core/chat/type';
import i18next from 'i18next';

export const getDisplayHistoryTitle = ({
  customTitle,
  title,
  fallbackTitle = i18next.t('common:core.chat.New Chat')
}: {
  // 数据库和日志聚合结果可能返回 null，统一在这里收敛成展示用兜底文案
  customTitle?: string | null;
  title?: string | null;
  fallbackTitle?: string;
}) => {
  const normalizedCustomTitle = customTitle?.trim();
  const normalizedTitle = title?.trim();
  return normalizedCustomTitle || normalizedTitle || fallbackTitle;
};

export const normalizeHistoryTitle = (history: ChatHistoryItemType) => ({
  ...history,
  title: getDisplayHistoryTitle({ title: history.title })
});

export const upsertHistoryTitle = ({
  histories,
  appId,
  chatId,
  title,
  fallbackTitle,
  now = new Date()
}: {
  histories: ChatHistoryItemType[];
  appId: string;
  chatId: string;
  title?: string;
  fallbackTitle?: string;
  now?: Date;
}) => {
  const nextTitle = getDisplayHistoryTitle({ title, fallbackTitle });
  const existingIndex = histories.findIndex(
    (item) => item.chatId === chatId && item.appId === appId
  );

  if (existingIndex >= 0) {
    return histories.map((item, index) =>
      index === existingIndex
        ? {
            ...item,
            title: nextTitle,
            updateTime: now
          }
        : item
    );
  }

  return [
    {
      chatId,
      appId,
      title: nextTitle,
      customTitle: '',
      top: false,
      updateTime: now,
      chatGenerateStatus: ChatGenerateStatusEnum.generating,
      hasBeenRead: false
    },
    ...histories
  ];
};
