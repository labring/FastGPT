import { ChatRoleEnum } from '@/constants/chat';
import type { InitChatResponse, InitShareChatResponse } from '@/api/response/chat';
import { QuoteItemType } from '@/pages/api/openapi/kb/appKbSearch';

export type ExportChatType = 'md' | 'pdf' | 'html';

export type ChatItemType = {
  _id?: string;
  obj: `${ChatRoleEnum}`;
  value: string;
  quoteLen?: number;
  quote?: QuoteItemType[];
  systemPrompt?: string;
  [key: string]: any;
};

export type ChatSiteItemType = {
  status: 'loading' | 'finish';
} & ChatItemType;

export interface ChatType extends InitChatResponse {
  history: ChatSiteItemType[];
}

export type HistoryItemType = {
  _id: string;
  updateTime: Date;
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
