import type { SearchDataResponseItemType } from '../dataset/type';
import type { ChatSourceEnum, ChatStatusEnum } from './constants';
import { ChatFileTypeEnum, ChatRoleEnum } from './constants';
import type { FlowNodeTypeEnum } from '../workflow/node/constant';
import { NodeOutputKeyEnum } from '../workflow/constants';
import type { DispatchNodeResponseKeyEnum } from '../workflow/runtime/constants';
import type { AppSchemaType, VariableItemType } from '../app/type';
import type { DispatchNodeResponseType } from '../workflow/runtime/type';
import type { ChatBoxInputType } from '../../../../projects/app/src/components/core/chat/ChatContainer/ChatBox/type';
import { WorkflowInteractiveResponseTypeSchema } from '../workflow/template/system/interactive/type';
import type { FlowNodeInputItemType } from '../workflow/type/io';
import z from 'zod';
import { AgentPlanSchema } from '../ai/agent/type';

/* One tool run response  */
export type ToolRunResponseItemType = any;
/* tool module response */
export const ToolModuleResponseItemSchema = z.object({
  id: z.string(),
  toolName: z.string(),
  toolAvatar: z.string(),
  params: z.string(),
  response: z.string().nullish(),
  functionName: z.string()
});
export type ToolModuleResponseItemType = z.infer<typeof ToolModuleResponseItemSchema>;

/* step call */
export const StepTitleItemSchema = z.object({
  stepId: z.string(),
  title: z.string(),

  // Client data
  folded: z.boolean().optional()
});
export type StepTitleItemType = z.infer<typeof StepTitleItemSchema>;

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
  appId: AppSchemaType;
};

/* --------- chat item ---------- */
// User
export const UserChatItemFileItemSchema = z.object({
  type: z.enum(ChatFileTypeEnum),
  name: z.string().optional(),
  key: z.string().optional(),
  url: z.string()
});
export type UserChatItemFileItemType = z.infer<typeof UserChatItemFileItemSchema>;

export const UserChatItemValueItemSchema = z.object({
  text: z
    .object({
      content: z.string()
    })
    .optional(),
  file: UserChatItemFileItemSchema.optional()
});
export type UserChatItemValueItemType = z.infer<typeof UserChatItemValueItemSchema>;

export const UserChatItemSchema = z.object({
  obj: z.literal(ChatRoleEnum.Human),
  value: z.array(UserChatItemValueItemSchema),
  hideInUI: z.boolean().optional()
});
export type UserChatItemType = z.infer<typeof UserChatItemSchema>;

// System
export const SystemChatItemValueItemSchema = z.object({
  text: z
    .object({
      content: z.string()
    })
    .nullish()
});
export type SystemChatItemValueItemType = z.infer<typeof SystemChatItemValueItemSchema>;

export const SystemChatItemSchema = z.object({
  obj: z.literal(ChatRoleEnum.System),
  value: z.array(SystemChatItemValueItemSchema)
});
export type SystemChatItemType = z.infer<typeof SystemChatItemSchema>;

// AI
export const AdminFbkSchema = z.object({
  feedbackDataId: z.string(),
  datasetId: z.string(),
  collectionId: z.string(),
  q: z.string(),
  a: z.string().optional()
});
export type AdminFbkType = z.infer<typeof AdminFbkSchema>;

export const AIChatItemValueSchema = z.object({
  id: z.string().nullish(),
  stepId: z.string().nullish(),
  text: z
    .object({
      content: z.string()
    })
    .nullish(),
  reasoning: z
    .object({
      content: z.string()
    })
    .nullish(),
  tool: ToolModuleResponseItemSchema.nullish(),
  interactive: WorkflowInteractiveResponseTypeSchema.optional(),
  plan: AgentPlanSchema.nullish(),
  stepTitle: StepTitleItemSchema.nullish(),

  // @deprecated
  tools: z.array(ToolModuleResponseItemSchema).nullish()
});

export type AIChatItemValueItemType = z.infer<typeof AIChatItemValueSchema>;

// TODO 待迁移成 zod
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
export type ChatItemObjItemType = UserChatItemType | SystemChatItemType | AIChatItemType;

export type ChatItemSchemaType = ChatItemObjItemType & {
  dataId: string;
  chatId: string;
  userId: string;
  teamId: string;
  tmbId: string;
  appId: string;
  time: Date;
  deleteTime?: Date | null;
};

export type ResponseTagItemType = {
  totalQuoteList?: SearchDataResponseItemType[];
  llmModuleAccount?: number;
  historyPreviewLength?: number;
  toolCiteLinks?: ToolCiteLinksType[];
};

export type ChatItemType = ChatItemObjItemType & {
  dataId?: string;
} & ResponseTagItemType;

// Frontend type
export type ChatSiteItemType = ChatItemObjItemType & {
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
  deleteTime?: Date | null;
  collapseTop?: {
    count: number;
    dataIds: string[];
    isExpanded: boolean;
  };
  collapseBottom?: {
    count: number;
    dataIds: string[];
    isExpanded: boolean;
  };
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
  apps: AppSchemaType[];
  teamInfo: any;
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

export const ToolCiteLinksSchema = z.object({
  name: z.string(),
  url: z.string()
});
export type ToolCiteLinksType = z.infer<typeof ToolCiteLinksSchema>;

/* dispatch run time */
export const RuntimeUserPromptSchema = z.object({
  files: z.array(UserChatItemFileItemSchema),
  text: z.string()
});
export type RuntimeUserPromptType = z.infer<typeof RuntimeUserPromptSchema>;
