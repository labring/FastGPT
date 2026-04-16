import { SearchDataResponseItemSchema } from '../dataset/type';
import {
  ChatFileTypeEnum,
  ChatGenerateStatusEnum,
  ChatRoleEnum,
  type ChatSourceEnum
} from './constants';
import { FlowNodeTypeEnum } from '../workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '../workflow/runtime/constants';
import { AppSchemaTypeSchema, type AppSchemaType, type VariableItemType } from '../app/type';
import { DispatchNodeResponseSchema } from '../workflow/runtime/type';
import { WorkflowInteractiveResponseTypeSchema } from '../workflow/template/system/interactive/type';
import type { FlowNodeInputItemType } from '../workflow/type/io';
import z from 'zod';
import { AgentPlanSchema } from '../ai/agent/type';

export const ChatHistoryItemResSchema = DispatchNodeResponseSchema.extend({
  nodeId: z.string(),
  id: z.string(),
  moduleType: z.enum(FlowNodeTypeEnum),
  moduleName: z.string()
});
export type ChatHistoryItemResType = z.infer<typeof ChatHistoryItemResSchema>;

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

/* Sandbox lifecycle phase */
export type SandboxStatusPhase =
  // Lifecycle phases
  | 'checkExisting' // checking for existing container in MongoDB
  | 'connecting' // warm-start: reusing existing container
  | 'fetchSkills' // cold-start: fetching skill metadata from DB
  | 'creatingContainer' // cold-start: creating container, waiting ready (up to 60s)
  // Skill deployment phases (used in both session-runtime and edit-debug)
  | 'deployingSkills' // announcing which skill is about to be deployed
  | 'downloadingPackage' // downloading skill package from MinIO
  | 'uploadingPackage' // uploading package into sandbox container
  | 'extractingPackage' // extracting package in sandbox
  // Lazy-init phases
  | 'lazyInit' // LLM first calls sandbox tool, triggers container creation
  // Terminal phases
  | 'ready' // sandbox is ready
  | 'failed'; // initialization failed
// Note: 'expiredDetected' and 'restarting' are internal and filtered server-side

export type SandboxStatusItemType = {
  sandboxId: string; // sessionId or skillId (correlates events for same sandbox)
  phase: SandboxStatusPhase;
  isWarmStart?: boolean; // present on 'connecting' and 'ready'
  skillName?: string; // present on 'deployingSkills', 'downloadingPackage',
  // 'uploadingPackage', 'extractingPackage' in session-runtime
  message?: string; // optional human-readable message
  // Present on 'ready' phase for edit-debug sandboxes
  endpoint?: {
    host: string;
    port: number;
    protocol: 'http' | 'https';
    url: string;
  };
  providerSandboxId?: string; // present on 'ready' for edit-debug
};

/* Skill module response */
export const SkillModuleResponseItemSchema = z.object({
  id: z.string(),
  skillName: z.string(),
  skillAvatar: z.string(),
  description: z.string(),
  skillMdPath: z.string()
});
export type SkillModuleResponseItemType = z.infer<typeof SkillModuleResponseItemSchema>;

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
  // Error count (redundant field for performance)
  errorCount?: number;

  /** 旧数据可能无此字段；业务上按 done 处理 */
  chatGenerateStatus?: ChatGenerateStatusEnum;
  hasBeenRead: boolean;

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
  planId: z.string().nullish(),
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
  planId: z.string().nullish(),
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
  tools: z.array(ToolModuleResponseItemSchema).nullish(),
  skills: z.array(SkillModuleResponseItemSchema).nullish(),
  interactive: WorkflowInteractiveResponseTypeSchema.optional(),
  plan: AgentPlanSchema.nullish(),
  stepTitle: StepTitleItemSchema.nullish(),

  /** @deprecated */
  tool: ToolModuleResponseItemSchema.nullish()
});

export type AIChatItemValueItemType = z.infer<typeof AIChatItemValueSchema>;

export const AIChatItemSchema = z.object({
  obj: z.literal(ChatRoleEnum.AI),
  value: z.array(AIChatItemValueSchema),
  memories: z.record(z.string(), z.any()).optional(),
  userGoodFeedback: z.string().optional(),
  userBadFeedback: z.string().optional(),
  customFeedbacks: z.array(z.string()).optional(),
  adminFeedback: AdminFbkSchema.optional(),
  isFeedbackRead: z.boolean().optional(),
  durationSeconds: z.number().optional(),
  errorMsg: z.string().optional(),
  citeCollectionIds: z.array(z.string()).optional(),
  [DispatchNodeResponseKeyEnum.nodeResponse]: z.array(ChatHistoryItemResSchema).optional().meta({
    description: '节点响应'
  })
});
export type AIChatItemType = z.infer<typeof AIChatItemSchema>;

export const ChatItemValueItemSchema = z.union([
  UserChatItemValueItemSchema,
  SystemChatItemValueItemSchema,
  AIChatItemValueSchema
]);
export type ChatItemValueItemType = z.infer<typeof ChatItemValueItemSchema>;

export const ChatItemObjItemSchema = z.union([
  UserChatItemSchema,
  SystemChatItemSchema,
  AIChatItemSchema
]);
export type ChatItemObjItemType = z.infer<typeof ChatItemObjItemSchema>;

export const ChatItemDBSchema = ChatItemObjItemSchema.and(
  z.object({
    dataId: z.string(),
    chatId: z.string(),
    userId: z.string(),
    teamId: z.string(),
    tmbId: z.string(),
    appId: z.string(),
    time: z.coerce.date(),
    deleteTime: z.coerce.date().nullish()
  })
);
export type ChatItemDBSchemaType = z.infer<typeof ChatItemDBSchema>;

// Client error show
const ErrorTextItemSchema = z.object({
  moduleName: z.string(),
  errorText: z.string()
});
export type ErrorTextItemType = z.infer<typeof ErrorTextItemSchema>;

/* --------- chat item response ---------- */
export const ChatItemResponseSchema = z.object({
  teamId: z.string(),
  appId: z.string(),
  chatId: z.string(),
  chatItemDataId: z.string(),
  data: ChatHistoryItemResSchema
});
export type ChatItemResponseSchemaType = z.infer<typeof ChatItemResponseSchema>;

/* --------- team chat --------- */
export const ChatAppListSchema = z.object({
  apps: z.array(AppSchemaTypeSchema),
  teamInfo: z.any(),
  uid: z.string().optional()
});
export type ChatAppListSchemaType = z.infer<typeof ChatAppListSchema>;

/* ---------- history ------------- */
export const HistoryItemSchema = z.object({
  chatId: z.string(),
  updateTime: z.coerce.date(),
  customTitle: z.string().optional(),
  title: z.string()
});
export type HistoryItemType = z.infer<typeof HistoryItemSchema>;

export const ChatHistoryItemSchema = HistoryItemSchema.extend({
  appId: z.string(),
  top: z.boolean().optional(),
  chatGenerateStatus: z.enum(ChatGenerateStatusEnum).optional(),
  hasBeenRead: z.boolean().optional()
});
export type ChatHistoryItemType = z.infer<typeof ChatHistoryItemSchema>;

/* ------- response data ------------ */
export const ToolCiteLinksSchema = z.object({
  name: z.string(),
  url: z.string()
});
export type ToolCiteLinksType = z.infer<typeof ToolCiteLinksSchema>;

export const ResponseTagItemSchema = z.object({
  useAgentSandbox: z.boolean().optional(),
  totalQuoteList: z.array(SearchDataResponseItemSchema).optional(),
  toolCiteLinks: z.array(ToolCiteLinksSchema).optional(),
  errorText: ErrorTextItemSchema.optional(),
  llmModuleAccount: z.number().optional().meta({ deprecated: true }),
  historyPreviewLength: z.number().optional().meta({ deprecated: true })
});
export type ResponseTagItemType = z.infer<typeof ResponseTagItemSchema>;

/* dispatch run time */
export const RuntimeUserPromptSchema = z.object({
  files: z.array(UserChatItemFileItemSchema),
  text: z.string()
});
export type RuntimeUserPromptType = z.infer<typeof RuntimeUserPromptSchema>;

export const ChatItemMiniSchema = ChatItemObjItemSchema.and(
  z.object({
    dataId: z.string().optional()
  })
).and(ResponseTagItemSchema);
export type ChatItemMiniType = z.infer<typeof ChatItemMiniSchema>;
