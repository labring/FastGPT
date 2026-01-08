import { ClassifyQuestionAgentItemType } from '../workflow/template/system/classifyQuestion/type';
import type { SearchDataResponseItemType } from '../dataset/type';
import type {
  ChatFileTypeEnum,
  ChatItemValueTypeEnum,
  ChatRoleEnum,
  ChatSourceEnum,
  ChatStatusEnum
} from './constants';
import type { FlowNodeTypeEnum } from '../workflow/node/constant';
import type { NodeInputKeyEnum, NodeOutputKeyEnum } from '../workflow/constants';
import type { DispatchNodeResponseKeyEnum } from '../workflow/runtime/constants';
import type { AppSchema, VariableItemType } from '../app/type';
import { AppChatConfigType } from '../app/type';
import type { AppSchema as AppType } from '@fastgpt/global/core/app/type.d';
import { DatasetSearchModeEnum } from '../dataset/constants';
import type { DispatchNodeResponseType } from '../workflow/runtime/type.d';
import type { ChatBoxInputType } from '../../../../projects/app/src/components/core/chat/ChatContainer/ChatBox/type';
import type { WorkflowInteractiveResponseType } from '../workflow/template/system/interactive/type';
import type { FlowNodeInputItemType } from '../workflow/type/io';
import type { FlowNodeTemplateType } from '../workflow/type/node.d';

/* --------- chat ---------- */
export type ChatSchemaType = {
  _id: string;
  chatId: string;
  userId: string;
  teamId: string;
  tmbId: string;
  appId: string;
  appVersionId?: string;
  createTime: Date;
  updateTime: Date;
  title: string;
  customTitle: string;
  top: boolean;
  source: `${ChatSourceEnum}`;
  sourceName?: string;

  shareId?: string;
  outLinkUid?: string;

  variableList?: VariableItemType[];
  welcomeText?: string;
  variables: Record<string, any>;
  pluginInputs?: FlowNodeInputItemType[];
  metadata?: Record<string, any>;

  // Boolean flags for efficient filtering
  hasGoodFeedback?: boolean;
  hasBadFeedback?: boolean;
  hasUnreadGoodFeedback?: boolean;
  hasUnreadBadFeedback?: boolean;

  deleteTime?: Date | null;
};

export type ChatWithAppSchema = Omit<ChatSchemaType, 'appId'> & {
  appId: AppSchema;
};

/* --------- chat item ---------- */
export type UserChatItemFileItemType = {
  type: `${ChatFileTypeEnum}`;
  name?: string;
  key?: string;
  url: string;
};
export type UserChatItemValueItemType = {
  type: ChatItemValueTypeEnum.text | ChatItemValueTypeEnum.file;
  text?: {
    content: string;
  };
  file?: UserChatItemFileItemType;
};
export type UserChatItemType = {
  obj: ChatRoleEnum.Human;
  value: UserChatItemValueItemType[];
  hideInUI?: boolean;
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
  type:
    | ChatItemValueTypeEnum.text
    | ChatItemValueTypeEnum.reasoning
    | ChatItemValueTypeEnum.tool
    | ChatItemValueTypeEnum.interactive;

  text?: {
    content: string;
  };
  reasoning?: {
    content: string;
  };
  tools?: ToolModuleResponseItemType[];
  interactive?: WorkflowInteractiveResponseType;
};
export type AIChatItemType = {
  obj: ChatRoleEnum.AI;
  value: AIChatItemValueItemType[];
  memories?: Record<string, any>;
  userGoodFeedback?: string;
  userBadFeedback?: string;
  customFeedbacks?: string[];
  adminFeedback?: AdminFbkType;
  isFeedbackRead?: boolean;

  durationSeconds?: number;
  errorMsg?: string;
  citeCollectionIds?: string[];

  // @deprecated 不再存储在 chatItemSchema 里，分别存储到 chatItemResponseSchema
  [DispatchNodeResponseKeyEnum.nodeResponse]?: ChatHistoryItemResType[];
};

export type ChatItemValueItemType =
  | UserChatItemValueItemType
  | SystemChatItemValueItemType
  | AIChatItemValueItemType;
export type ChatItemMergeType = UserChatItemType | SystemChatItemType | AIChatItemType;

export type ChatItemSchema = ChatItemMergeType & {
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

export type ResponseTagItemType = {
  totalQuoteList?: SearchDataResponseItemType[];
  llmModuleAccount?: number;
  historyPreviewLength?: number;
  toolCiteLinks?: ToolCiteLinksType[];
};

export type ChatItemType = ChatItemMergeType & {
  dataId?: string;
} & ResponseTagItemType;

// Frontend type
export type ChatSiteItemType = ChatItemMergeType & {
  _id?: string;
  id: string;
  dataId: string;
  status: `${ChatStatusEnum}`;
  moduleName?: string;
  ttsBuffer?: Uint8Array;
  responseData?: ChatHistoryItemResType[];
  time?: Date;
  durationSeconds?: number;
  errorMsg?: string;
} & ChatBoxInputType &
  ResponseTagItemType;

/* --------- chat item response ---------- */
export type ChatItemResponseSchemaType = {
  teamId: string;
  appId: string;
  chatId: string;
  chatItemDataId: string;
  data: ChatHistoryItemResType;
};

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
  top?: boolean;
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

export type ToolCiteLinksType = {
  name: string;
  url: string;
};
/* dispatch run time */
export type RuntimeUserPromptType = {
  files: UserChatItemValueItemType['file'][];
  text: string;
};
