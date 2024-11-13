import { ClassifyQuestionAgentItemType } from '../workflow/template/system/classifyQuestion/type';
import { SearchDataResponseItemType } from '../dataset/type';
import {
  ChatFileTypeEnum,
  ChatItemValueTypeEnum,
  ChatRoleEnum,
  ChatSourceEnum,
  ChatStatusEnum
} from './constants';
import { FlowNodeTypeEnum } from '../workflow/node/constant';
import { NodeOutputKeyEnum } from '../workflow/constants';
import { DispatchNodeResponseKeyEnum } from '../workflow/runtime/constants';
import { AppChatConfigType, AppSchema, VariableItemType } from '../app/type';
import type { AppSchema as AppType } from '@fastgpt/global/core/app/type.d';
import { DatasetSearchModeEnum } from '../dataset/constants';
import { DispatchNodeResponseType } from '../workflow/runtime/type.d';
import { ChatBoxInputType } from '../../../../projects/app/src/components/core/chat/ChatContainer/ChatBox/type';
import { WorkflowInteractiveResponseType } from '../workflow/template/system/interactive/type';

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
  source: `${ChatSourceEnum}`;
  shareId?: string;
  outLinkUid?: string;

  variableList?: VariableItemType[];
  welcomeText?: string;
  variables: Record<string, any>;
  metadata?: Record<string, any>;
};

export type ChatWithAppSchema = Omit<ChatSchema, 'appId'> & {
  appId: AppSchema;
};

export type UserChatItemValueItemType = {
  type: ChatItemValueTypeEnum.text | ChatItemValueTypeEnum.file;
  text?: {
    content: string;
  };
  file?: {
    type: `${ChatFileTypeEnum}`;
    name?: string;
    url: string;
  };
};
export type UserChatItemType = {
  obj: ChatRoleEnum.Human;
  value: UserChatItemValueItemType[];
};
export type SystemChatItemValueItemType = {
  type: ChatItemValueTypeEnum.text;
  text?: {
    content: string;
  };
};
export type SystemChatItemType = {
  obj: ChatRoleEnum.System;
  value: SystemChatItemValueItemType[];
};
export type AIChatItemValueItemType = {
  type: ChatItemValueTypeEnum.text | ChatItemValueTypeEnum.tool | ChatItemValueTypeEnum.interactive;
  text?: {
    content: string;
  };
  tools?: ToolModuleResponseItemType[];
  interactive?: WorkflowInteractiveResponseType;
};
export type AIChatItemType = {
  obj: ChatRoleEnum.AI;
  value: AIChatItemValueItemType[];
  userGoodFeedback?: string;
  userBadFeedback?: string;
  customFeedbacks?: string[];
  adminFeedback?: AdminFbkType;
  [DispatchNodeResponseKeyEnum.nodeResponse]?: ChatHistoryItemResType[];
};
export type ChatItemValueItemType =
  | UserChatItemValueItemType
  | SystemChatItemValueItemType
  | AIChatItemValueItemType;

export type ChatItemSchema = (UserChatItemType | SystemChatItemType | AIChatItemType) & {
  dataId: string;
  chatId: string;
  userId: string;
  teamId: string;
  tmbId: string;
  appId: string;
  time: Date;
};

export type AdminFbkType = {
  feedbackDataId: string;
  datasetId: string;
  collectionId: string;
  q: string;
  a?: string;
};

/* --------- chat item ---------- */
export type ResponseTagItemType = {
  totalRunningTime?: number;
  totalQuoteList?: SearchDataResponseItemType[];
  llmModuleAccount?: number;
  historyPreviewLength?: number;
};

export type ChatItemType = (UserChatItemType | SystemChatItemType | AIChatItemType) & {
  dataId?: string;
} & ResponseTagItemType;

// Frontend type
export type ChatSiteItemType = (UserChatItemType | SystemChatItemType | AIChatItemType) & {
  dataId: string;
  status: `${ChatStatusEnum}`;
  moduleName?: string;
  ttsBuffer?: Uint8Array;
  responseData?: ChatHistoryItemResType[];
  time?: Date;
} & ChatBoxInputType &
  ResponseTagItemType;

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
export type ChatHistoryItemResType = DispatchNodeResponseType & {
  nodeId: string;
  id: string;
  moduleType: FlowNodeTypeEnum;
  moduleName: string;
};

/* ---------- node outputs ------------ */
export type NodeOutputItemType = {
  nodeId: string;
  key: NodeOutputKeyEnum;
  value: any;
};

/* One tool run response  */
export type ToolRunResponseItemType = any;
/* tool module response */
export type ToolModuleResponseItemType = {
  id: string;
  toolName: string; // tool name
  toolAvatar: string;
  params: string; // tool params
  response: string;
  functionName: string;
};

/* dispatch run time */
export type RuntimeUserPromptType = {
  files: UserChatItemValueItemType['file'][];
  text: string;
};
