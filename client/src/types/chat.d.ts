import { ChatRoleEnum } from '@/constants/chat';
import type { InitChatResponse, InitShareChatResponse } from '@/api/response/chat';
import { TaskResponseKeyEnum } from '@/constants/chat';
import { ClassifyQuestionAgentItemType } from './app';

export type ExportChatType = 'md' | 'pdf' | 'html';

export type ChatItemType = {
  _id?: string;
  obj: `${ChatRoleEnum}`;
  value: string;
  [TaskResponseKeyEnum.responseData]?: ChatHistoryItemResType[];
};

export type ChatSiteItemType = {
  status: 'loading' | 'finish';
} & ChatItemType;

export type HistoryItemType = {
  chatId: string;
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

export type QuoteItemType = {
  kb_id: string;
  id: string;
  q: string;
  a: string;
  source?: string;
};

export type ChatHistoryItemResType = {
  moduleName: string;
  price: number;
  model?: string;
  tokens?: number;

  // chat
  answer?: string;
  question?: string;
  temperature?: number;
  maxToken?: number;
  quoteList?: QuoteItemType[];
  completeMessages?: ChatItemType[];

  // kb search
  similarity?: number;
  limit?: number;

  // cq
  cqList?: ClassifyQuestionAgentItemType[];
  cqResult?: string;
};
