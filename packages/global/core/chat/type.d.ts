import { ClassifyQuestionAgentItemType } from '../module/type';
import { SearchDataResponseItemType } from '../dataset/type';
import {
  ChatFileTypeEnum,
  ChatItemValueTypeEnum,
  ChatRoleEnum,
  ChatSourceEnum,
  ChatStatusEnum
} from './constants';
import { FlowNodeTypeEnum } from '../module/node/constant';
import { ModuleOutputKeyEnum, ModuleRunTimerOutputEnum } from '../module/constants';
import { AppSchema } from '../app/type';
import type { AppSchema as AppType } from '@fastgpt/global/core/app/type.d';
import { DatasetSearchModeEnum } from '../dataset/constants';
import { ChatBoxInputType } from '../../../../projects/app/src/components/ChatBox/type';

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
  outLinkUid?: string;
  content: ChatItemType[];
  metadata?: Record<string, any>;
};

export type ChatWithAppSchema = Omit<ChatSchema, 'appId'> & {
  appId: AppSchema;
};

export type ChatItemValueItemType = {
  type: `${ChatItemValueTypeEnum}`;
  text?: {
    content: string;
  };
  file?: {
    type: `${ChatFileTypeEnum}`;
    name: string;
    url: string;
  };
  tools?: ToolModuleResponseItemType[];
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
  value: ChatItemValueItemType[];
  userGoodFeedback?: string;
  userBadFeedback?: string;
  customFeedbacks?: string[];
  adminFeedback?: AdminFbkType;
  [ModuleRunTimerOutputEnum.responseData]?: ChatHistoryItemResType[];
};

export type AdminFbkType = {
  dataId: string;
  datasetId: string;
  collectionId: string;
  q: string;
  a?: string;
};

/* --------- chat item ---------- */
export type ChatItemType = {
  dataId?: string;
  obj: `${ChatRoleEnum}`;
  value: ChatItemValueItemType[];
  userGoodFeedback?: string;
  userBadFeedback?: string;
  customFeedbacks?: ChatItemSchema['customFeedbacks'];
  adminFeedback?: ChatItemSchema['feedback'];
  [ModuleRunTimerOutputEnum.responseData]?: ChatHistoryItemResType[];
};

export type ChatSiteItemType = ChatItemType & {
  status: `${ChatStatusEnum}`;
  moduleName?: string;
  ttsBuffer?: Uint8Array;
} & ChatBoxInputType;

/* --------- team chat --------- */
export type ChatAppListSchema = {
  apps: AppType[];
  teamInfo: teamInfoSchema;
  uid?: string;
};

/* ---------- history ------------- */
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

/* ------- response data ------------ */
export type moduleDispatchResType = {
  // common
  moduleLogo?: string;
  runningTime?: number;
  query?: string;
  textOutput?: string;

  // bill
  tokens?: number;
  model?: string;
  contextTotalLen?: number;
  totalPoints?: number;

  // chat
  temperature?: number;
  maxToken?: number;
  quoteList?: SearchDataResponseItemType[];
  historyPreview?: {
    obj: `${ChatRoleEnum}`;
    value: string;
  }[]; // completion context array. history will slice

  // dataset search
  similarity?: number;
  limit?: number;
  searchMode?: `${DatasetSearchModeEnum}`;
  searchUsingReRank?: boolean;
  extensionModel?: string;
  extensionResult?: string;
  extensionTokens?: number;

  // cq
  cqList?: ClassifyQuestionAgentItemType[];
  cqResult?: string;

  // content extract
  extractDescription?: string;
  extractResult?: Record<string, any>;

  // http
  params?: Record<string, any>;
  body?: Record<string, any>;
  headers?: Record<string, any>;
  httpResult?: Record<string, any>;

  // plugin output
  pluginOutput?: Record<string, any>;
  pluginDetail?: ChatHistoryItemResType[];

  // tf switch
  tfSwitchResult?: boolean;
};

export type ChatHistoryItemResType = moduleDispatchResType & {
  moduleType: `${FlowNodeTypeEnum}`;
  moduleName: string;
};
/* One tool run response  */
export type ToolRunResponseItemType = {
  moduleId: string;
  response: Record<string, any>;
};
/* tool module response */
export type ToolModuleResponseItemType = {
  id: string;
  toolName: string; // tool name
  avatar: string;
  params: string; // tool params
  response: string;
  functionName: string;
};

/* dispatch run time */
export type RuntimeFileType = {
  type: `${ChatFileTypeEnum}`;
  name: string;
  url: string; // image url or file path
};
export type RuntimeUserPromptType = {
  files?: RuntimeFileType[];
  text: string;
};
