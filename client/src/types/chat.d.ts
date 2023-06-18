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
};

export type ChatSiteItemType = {
  status: 'loading' | 'finish';
} & ChatItemType;

export interface ChatType extends InitChatResponse {
  history: ChatSiteItemType[];
}

export interface ShareChatType extends InitShareChatResponse {
  history: ChatSiteItemType[];
}

export type HistoryItemType = {
  _id: string;
  updateTime: Date;
  modelId: string;
  title: string;
  latestChat: string;
  top: boolean;
};

export type ShareChatHistoryItemType = {
  _id: string;
  shareId: string;
  updateTime: Date;
  title: string;
  latestChat: string;
  chats: ChatSiteItemType[];
};
