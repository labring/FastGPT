import { ChatRoleEnum } from '@/constants/chat';
import type { InitChatResponse } from '@/global/core/api/chatRes.d';
import type { InitShareChatResponse } from '@/global/support/api/outLinkRes.d';
import { TaskResponseKeyEnum } from '@/constants/chat';
import { ClassifyQuestionAgentItemType } from './app';
import { ChatItemSchema } from './mongoSchema';
import { FlowModuleTypeEnum } from '@/constants/flow';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';

export type ExportChatType = 'md' | 'pdf' | 'html';

export type ChatItemType = {
  dataId?: string;
  obj: `${ChatRoleEnum}`;
  value: string;
  userFeedback?: string;
  adminFeedback?: ChatItemSchema['adminFeedback'];
  [TaskResponseKeyEnum.responseData]?: ChatHistoryItemResType[];
};

export type ChatSiteItemType = {
  status: 'loading' | 'running' | 'finish';
  moduleName?: string;
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

// response data
export type ChatHistoryItemResType = {
  moduleType: `${FlowModuleTypeEnum}`;
  moduleName: string;
  price: number;
  runningTime?: number;
  tokens?: number;
  model?: string;

  // chat
  question?: string;
  temperature?: number;
  maxToken?: number;
  quoteList?: SearchDataResponseItemType[];
  historyPreview?: ChatItemType[]; // completion context array. history will slice

  // dataset search
  similarity?: number;
  limit?: number;

  // cq
  cqList?: ClassifyQuestionAgentItemType[];
  cqResult?: string;

  // content extract
  extractDescription?: string;
  extractResult?: Record<string, any>;

  // http
  body?: Record<string, any>;
  httpResult?: Record<string, any>;
};
