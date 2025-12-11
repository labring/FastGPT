import { StoreNodeItemTypeSchema } from '../workflow/type/node';
import { AppTypeEnum } from './constants';
import type { NodeInputKeyEnum } from '../workflow/constants';
import { VariableInputEnum } from '../workflow/constants';
import { InputComponentPropsTypeSchema } from '../workflow/type/io';
import { DatasetSearchModeEnum } from '../dataset/constants';
import { StoreEdgeItemTypeSchema } from '../workflow/type/edge';
import type { AppPermission } from '../../support/permission/app/controller';
import { ParentIdSchema, type ParentIdType } from '../../common/parentFolder/type';
import type { WorkflowTemplateBasicType } from '../workflow/type';
import type { SourceMemberType } from '../../support/user/type';
import z from 'zod';
import { ObjectIdSchema } from '../../common/type/mongo';

/* app chat config type */
// File
export const AppFileSelectConfigTypeSchema = z.object({
  maxFiles: z.number().optional(),
  canSelectFile: z.boolean().optional(),
  customPdfParse: z.boolean().optional(),
  canSelectImg: z.boolean().optional(),
  canSelectVideo: z.boolean().optional(),
  canSelectAudio: z.boolean().optional(),
  canSelectCustomFileExtension: z.boolean().optional(),
  customFileExtensionList: z.array(z.string()).optional()
});
export type AppFileSelectConfigType = z.infer<typeof AppFileSelectConfigTypeSchema>;

// variable
export const VariableItemTypeSchema = AppFileSelectConfigTypeSchema.and(
  InputComponentPropsTypeSchema
).and(
  z.object({
    type: z.enum(VariableInputEnum),
    description: z.string()
  })
);
export type VariableItemType = z.infer<typeof VariableItemTypeSchema>;

// tts
export const AppTTSConfigTypeSchema = z.object({
  type: z.enum(['none', 'web', 'model']),
  model: z.string().optional(),
  voice: z.string().optional(),
  speed: z.number().optional()
});
export type AppTTSConfigType = z.infer<typeof AppTTSConfigTypeSchema>;

// whisper
export const AppWhisperConfigTypeSchema = z.object({
  open: z.boolean(),
  autoSend: z.boolean(),
  autoTTSResponse: z.boolean()
});
export type AppWhisperConfigType = z.infer<typeof AppWhisperConfigTypeSchema>;

// question guide
export const AppQGConfigTypeSchema = z.object({
  open: z.boolean(),
  model: z.string().optional(),
  customPrompt: z.string().optional()
});
export type AppQGConfigType = z.infer<typeof AppQGConfigTypeSchema>;

// question guide text
export const ChatInputGuideConfigTypeSchema = z.object({
  open: z.boolean(),
  customUrl: z.string()
});
export type ChatInputGuideConfigType = z.infer<typeof ChatInputGuideConfigTypeSchema>;

// interval timer
export const AppScheduledTriggerConfigTypeSchema = z.object({
  cronString: z.string(),
  timezone: z.string(),
  defaultPrompt: z.string()
});
export type AppScheduledTriggerConfigType = z.infer<typeof AppScheduledTriggerConfigTypeSchema>;

// auto execute
export const AppAutoExecuteConfigTypeSchema = z.object({
  open: z.boolean(),
  defaultPrompt: z.string()
});
export type AppAutoExecuteConfigType = z.infer<typeof AppAutoExecuteConfigTypeSchema>;

export const AppChatConfigTypeSchema = z.object({
  welcomeText: z.string().optional(),
  variables: z.array(VariableItemTypeSchema).optional(),
  autoExecute: AppAutoExecuteConfigTypeSchema.optional(),
  questionGuide: AppQGConfigTypeSchema.optional(),
  ttsConfig: AppTTSConfigTypeSchema.optional(),
  whisperConfig: AppWhisperConfigTypeSchema.optional(),
  scheduledTriggerConfig: AppScheduledTriggerConfigTypeSchema.optional(),
  chatInputGuide: ChatInputGuideConfigTypeSchema.optional(),
  fileSelectConfig: AppFileSelectConfigTypeSchema.optional(),
  instruction: z.string().optional()
});
export type AppChatConfigType = z.infer<typeof AppChatConfigTypeSchema>;

// Mongo Collection
export const AppSchemaTypeSchema = z.object({
  _id: ObjectIdSchema,
  parentId: ParentIdSchema.optional(),
  teamId: z.string(),
  tmbId: z.string(),
  type: z.enum(AppTypeEnum),
  version: z.enum(['v1', 'v2']).optional(),

  name: z.string(),
  avatar: z.string(),
  intro: z.string(),
  templateId: z.string().optional(),

  updateTime: z.date(),

  modules: z.array(StoreNodeItemTypeSchema),
  edges: z.array(StoreEdgeItemTypeSchema),
  pluginData: z
    .object({
      nodeVersion: z.string().optional(),
      pluginUniId: z.string().optional(), // plugin unique id(plugin name)
      apiSchemaStr: z.string().optional(), // api schema string
      customHeaders: z.string().optional()
    })
    .optional(),

  // App system config
  chatConfig: AppChatConfigTypeSchema,
  scheduledTriggerConfig: AppScheduledTriggerConfigTypeSchema.optional(),
  scheduledTriggerNextTime: z.date().optional(),

  inheritPermission: z.boolean().optional(),

  // if access the app by favourite or quick
  favourite: z.boolean().optional(),
  quick: z.boolean().optional(),

  // 软删除字段
  deleteTime: z.date().nullish(),

  /** @deprecated */
  defaultPermission: z.number().optional(),
  /** @deprecated */
  inited: z.boolean().optional(),
  /** @deprecated */
  teamTags: z.array(z.string()).optional()
});
export type AppSchemaType = z.infer<typeof AppSchemaTypeSchema>;

export type AppListItemType = {
  _id: string;
  parentId: ParentIdType;
  tmbId: string;
  name: string;
  avatar: string;
  intro: string;
  type: AppTypeEnum;
  updateTime: Date;
  pluginData?: AppSchemaType['pluginData'];
  permission: AppPermission;
  inheritPermission?: boolean;
  private?: boolean;
  sourceMember: SourceMemberType;
  hasInteractiveNode?: boolean;
};

export type AppDetailType = AppSchemaType & {
  permission: AppPermission;
};

export const AppDatasetSearchParamsTypeSchema = z.object({
  searchMode: z.enum(DatasetSearchModeEnum),
  limit: z.number().optional(), // limit max tokens
  similarity: z.number().optional(),
  embeddingWeight: z.number().optional(), // embedding weight, fullText weight = 1 - embeddingWeight

  usingReRank: z.boolean().optional(),
  rerankModel: z.string().optional(),
  rerankWeight: z.number().optional(),

  datasetSearchUsingExtensionQuery: z.boolean().optional(),
  datasetSearchExtensionModel: z.string().optional(),
  datasetSearchExtensionBg: z.string().optional()
});
export type AppDatasetSearchParamsType = z.infer<typeof AppDatasetSearchParamsTypeSchema>;

export type SettingAIDataType = {
  model: string;
  temperature?: number;
  maxToken?: number;
  isResponseAnswerText?: boolean;
  maxHistories?: number;
  [NodeInputKeyEnum.aiChatVision]?: boolean; // Is open vision mode
  [NodeInputKeyEnum.aiChatReasoning]?: boolean; // Is open reasoning mode
  [NodeInputKeyEnum.aiChatTopP]?: number;
  [NodeInputKeyEnum.aiChatStopSign]?: string;
  [NodeInputKeyEnum.aiChatResponseFormat]?: string;
  [NodeInputKeyEnum.aiChatJsonSchema]?: string;
};

export type AppTemplateSchemaType = {
  templateId: string;
  name: string;
  intro: string;
  avatar: string;
  tags: string[];
  type: string;
  author?: string;
  isActive?: boolean;
  isPromoted?: boolean;
  recommendText?: string;
  userGuide?: {
    type: 'markdown' | 'link';
    content?: string;
    link?: string;
  };
  isQuickTemplate?: boolean;
  order?: number;
  // TODO: 对于建议应用，是另一个格式
  workflow: WorkflowTemplateBasicType;
};

export type TemplateTypeSchemaType = {
  typeName: string;
  typeId: string;
  typeOrder: number;
};
