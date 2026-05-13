import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatHistoryItemType } from '@fastgpt/global/core/chat/type';

export const getDisplayHistoryTitle = ({
  title,
  fallbackTitle
}: {
  title?: string;
  fallbackTitle: string;
}) => {
  const normalizedTitle = title?.trim();
  return normalizedTitle || fallbackTitle;
};

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
  fallbackTitle: string;
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
