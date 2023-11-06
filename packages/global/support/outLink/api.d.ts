import type { HistoryItemType, ChatSiteItemType } from '../../core/chat/type.d';
import type { InitChatResponse } from '../../core/chat/api.d';

export type InitShareChatResponse = {
  userAvatar: string;
  app: InitChatResponse['app'];
};

/* one page type */
export type ShareChatType = InitShareChatResponse & {
  history: ShareChatHistoryItemType;
};

/* history list item type */
export type ShareChatHistoryItemType = HistoryItemType & {
  shareId: string;
  variables?: Record<string, any>;
  chats: ChatSiteItemType[];
};
