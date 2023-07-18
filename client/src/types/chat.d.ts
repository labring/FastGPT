import { ChatRoleEnum, rawSearchKey } from '@/constants/chat';
import type { InitChatResponse, InitShareChatResponse } from '@/api/response/chat';
import { QuoteItemType } from '@/pages/api/openapi/kb/appKbSearch';

export type ExportChatType = 'md' | 'pdf' | 'html';

export type ChatItemType = {
  _id?: string;
  obj: `${ChatRoleEnum}`;
  value: string;
  [rawSearchKey]?: QuoteItemType[];
  quoteLen?: number;
  [key: string]: any;
};

export type ChatSiteItemType = {
  status: 'loading' | 'finish';
} & ChatItemType;

export type HistoryItemType = {
  _id: string;
  updateTime: Date;
  customTitle?: string;
  title: string;
};
export type ChatHistoryItemType = HistoryItemType & {
  appId: string;
  top: boolean;
};

export type ShareChatHistoryItemType = HistoryItemType & {
  shareId: string;
  variables?: Record<string, any>;
  chats: ChatSiteItemType[];
};

export type ShareChatType = InitShareChatResponse & {
  history: ShareChatHistoryItemType;
};
