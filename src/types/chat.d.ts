import { ChatRoleEnum } from '@/constants/chat';
import type { InitChatResponse, InitShareChatResponse } from '@/api/response/chat';

export type ExportChatType = 'md' | 'pdf' | 'html';

export type ChatItemSimpleType = {
  obj: `${ChatRoleEnum}`;
  value: string;
  systemPrompt?: string;
};
export type ChatItemType = {
  _id: string;
} & ChatItemSimpleType;

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
};

export type ShareChatHistoryItemType = {
  _id: string;
  shareId: string;
  updateTime: Date;
  title: string;
  latestChat: string;
  chats: ChatSiteItemType[];
};
