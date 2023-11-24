import { ClassifyQuestionAgentItemType } from '../module/type';
import { SearchDataResponseItemType } from '../dataset/type';
import { ChatRoleEnum, ChatSourceEnum } from './constants';
import { FlowNodeTypeEnum } from '../module/node/constant';
import { ModuleOutputKeyEnum } from '../module/constants';
import { AppSchema } from '../app/type';

export type ChatSchema = {
  _id: string;
  chatId: string;
  userId: string;
  teamId: string;
  tmbId: string;
  appId: string;
  updateTime: Date;
  title: string;
  customTitle: string;
  top: boolean;
  variables: Record<string, any>;
  source: `${ChatSourceEnum}`;
  shareId?: string;
  isInit: boolean;
  content: ChatItemType[];
};

export type ChatWithAppSchema = Omit<ChatSchema, 'appId'> & {
  appId: AppSchema;
};

export type ChatItemSchema = {
  dataId: string;
  chatId: string;
  userId: string;
  teamId: string;
  tmbId: string;
  appId: string;
  time: Date;
  obj: `${ChatRoleEnum}`;
  value: string;
  userFeedback?: string;
  adminFeedback?: AdminFbkType;
  [ModuleOutputKeyEnum.responseData]?: ChatHistoryItemResType[];
};

export type AdminFbkType = {
  dataId: string;
  datasetId: string;
  collectionId: string;
  q: string;
  a?: string;
};

export type ChatItemType = {
  dataId?: string;
  obj: ChatItemSchema['obj'];
  value: any;
  userFeedback?: string;
  adminFeedback?: ChatItemSchema['feedback'];
  [ModuleOutputKeyEnum.responseData]?: ChatHistoryItemResType[];
};

export type ChatSiteItemType = ChatItemType & {
  status: 'loading' | 'running' | 'finish';
  moduleName?: string;
  ttsBuffer?: Uint8Array;
};

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

// response data
export type moduleDispatchResType = {
  moduleLogo?: string;
  price: number;
  runningTime?: number;
  tokens?: number;
  model?: string;
  query?: string;

  // chat
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

  // plugin output
  pluginOutput?: Record<string, any>;
};
