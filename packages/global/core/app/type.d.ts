import type { FlowNodeTemplateType, StoreNodeItemType } from '../workflow/type/node';
import type { AppTypeEnum } from './constants';
import { PermissionTypeEnum } from '../../support/permission/constant';
import { PermissionSchema } from '../../support/permission/type';
import { SourceMemberSchema } from '../../support/user/type.d';
import type { NodeInputKeyEnum, VariableInputEnum } from '../workflow/constants';
import type { SelectedDatasetType } from '../workflow/type/io';
import type { DatasetSearchModeEnum } from '../dataset/constants';
import { TeamTagSchema as TeamTagsSchemaType } from '@fastgpt/global/support/user/team/type.d';
import type { StoreEdgeItemType } from '../workflow/type/edge';
import type { AppPermission } from '../../support/permission/app/controller';
import type { ParentIdType } from '../../common/parentFolder/type';
import { FlowNodeInputTypeEnum } from '../workflow/node/constant';
import type { WorkflowTemplateBasicType } from '@fastgpt/global/core/workflow/type';
import type { SourceMemberType } from '../../support/user/type';
import type { JSONSchemaInputType } from './jsonschema';
import { z } from '../../common/tsRest/z';
import {
  ObjectIdSchema,
  ParentIdSchema,
  DateTimeSchema,
  createCommonResponseSchema
} from '../../common/type/utils';

export const AppTypeSchema = z
  .enum(['folder', 'simple', 'advanced', 'plugin', 'httpPlugin', 'toolSet', 'tool', 'hidden'])
  .describe(
    '应用类型: \nfolder - 文件夹, \nsimple - 简单应用, \nadvanced - 高级工作流, \nplugin - 插件, \nhttpPlugin - HTTP插件, \ntoolSet - 工具集, \ntool - 工具, \nhidden - 隐藏应用'
  );
export type AppTypeEnum = z.infer<typeof AppTypeSchema>;

export const VariableInputTypeSchema = z
  .enum([
    'input',
    'textarea',
    'numberInput',
    'select',
    'multipleSelect',
    'timePointSelect',
    'timeRangeSelect',
    'password',
    'switch',
    'file',
    'modelSelect',
    'datasetSelect',
    'custom',
    'internal',
    'JSONEditor'
  ])
  .describe('变量输入类型');
export type VariableInputTypeEnum = z.infer<typeof VariableInputTypeSchema>;

export const WorkflowIOValueTypeSchema = z
  .enum([
    'string',
    'number',
    'boolean',
    'object',

    'arrayString',
    'arrayNumber',
    'arrayBoolean',
    'arrayObject',
    'arrayAny',
    'any',

    'chatHistory',
    'datasetQuote',

    'dynamic',

    'selectDataset',

    'selectApp'
  ])
  .describe('工作流 I/O 值类型');
export const WorkflowIOValueTypeEnum = WorkflowIOValueTypeSchema.enum;
export type WorkflowIOValueType = z.infer<typeof WorkflowIOValueTypeSchema>;

export const VariableItemSchema = z
  .object({
    key: z.string().min(1).describe('变量标识符'),
    label: z.string().min(1).describe('变量显示名称'),
    type: VariableInputTypeSchema.describe('变量输入类型'),
    required: z.boolean().describe('是否必填'),
    description: z.string().describe('变量描述'),
    valueType: WorkflowIOValueTypeSchema.optional().describe('值类型'),
    defaultValue: z.any().optional().describe('默认值'),
    maxLength: z.number().positive().optional().describe('输入最大长度'),
    max: z.number().optional().describe('数值最大值'),
    min: z.number().optional().describe('数值最小值'),
    list: z
      .array(
        z.object({
          label: z.string().describe('选项显示文本'),
          value: z.string().describe('选项值')
        })
      )
      .optional()
      .describe('选择项列表'),
    /**
     * @deprecated
     */
    enums: z
      .array(
        z.object({
          value: z.string(),
          label: z.string()
        })
      )
      .openapi({ deprecated: true })
      .optional()
      .describe('已废弃的枚举选项')
  })
  .describe('应用变量配置项');
export type VariableItemType = z.infer<typeof VariableItemSchema>;

export const AppTTSConfigSchema = z
  .object({
    type: z.enum(['none', 'web', 'model']).describe('TTS 类型'),
    model: z.string().optional().describe('TTS 模型'),
    voice: z.string().optional().describe('语音类型'),
    speed: z.number().min(0.1).max(3).optional().describe('语音速度')
  })
  .describe('文字转语音(TTS)配置');
export type AppTTSConfigType = z.infer<typeof AppTTSConfigSchema>;

export const AppWhisperConfigSchema = z
  .object({
    open: z.boolean().describe('是否启用语音输入'),
    autoSend: z.boolean().describe('是否自动发送'),
    autoTTSResponse: z.boolean().describe('是否自动语音回复')
  })
  .describe('语音识别(Whisper)配置');
export type AppWhisperConfigType = z.infer<typeof AppWhisperConfigSchema>;

export const AppQGConfigSchema = z
  .object({
    open: z.boolean().describe('是否启用问题引导'),
    model: z.string().optional().describe('引导问题生成模型'),
    customPrompt: z.string().optional().describe('自定义引导词')
  })
  .describe('问题引导配置');
export type AppQGConfigType = z.infer<typeof AppQGConfigSchema>;

export const AppAutoExecuteConfigSchema = z
  .object({
    open: z.boolean().describe('是否启用自动执行'),
    defaultPrompt: z.string().describe('默认提示词')
  })
  .describe('自动执行配置');
export type AppAutoExecuteConfigType = z.infer<typeof AppAutoExecuteConfigSchema>;

export const ChatInputGuideConfigSchema = z
  .object({
    open: z.boolean().describe('是否启用输入引导'),
    customUrl: z.string().describe('自定义引导链接')
  })
  .describe('聊天输入引导配置');
export type ChatInputGuideConfigType = z.infer<typeof ChatInputGuideConfigSchema>;

export const AppFileSelectConfigSchema = z
  .object({
    canSelectFile: z.boolean().describe('是否可选择文件'),
    customPdfParse: z.boolean().optional().describe('是否自定义PDF解析'),
    canSelectImg: z.boolean().describe('是否可选择图片'),
    maxFiles: z.number().positive().describe('最大文件数量')
  })
  .describe('文件选择配置');
export type AppFileSelectConfigType = z.infer<typeof AppFileSelectConfigSchema>;

export const ScheduledTriggerConfigSchema = z
  .object({
    cronString: z.string().min(1).describe('cron 表达式'),
    timezone: z.string().min(1).describe('时区'),
    defaultPrompt: z.string().describe('默认触发提示词')
  })
  .describe('定时触发配置');
export type AppScheduledTriggerConfigType = z.infer<typeof ScheduledTriggerConfigSchema>;

export const AppChatConfigSchema = z
  .object({
    welcomeText: z.string().optional().describe('欢迎语'),
    variables: z.array(VariableItemSchema).optional().describe('应用变量列表'),
    autoExecute: AppAutoExecuteConfigSchema.optional().describe('自动执行配置'),
    questionGuide: AppQGConfigSchema.optional().describe('问题引导配置'),
    ttsConfig: AppTTSConfigSchema.optional().describe('文字转语音配置'),
    whisperConfig: AppWhisperConfigSchema.optional().describe('语音识别配置'),
    scheduledTriggerConfig: ScheduledTriggerConfigSchema.optional().describe('定时触发配置'),
    chatInputGuide: ChatInputGuideConfigSchema.optional().describe('聊天输入引导配置'),
    fileSelectConfig: AppFileSelectConfigSchema.optional().describe('文件选择配置'),
    instruction: z.string().optional().describe('应用指令说明')
  })
  .describe('应用聊天配置');
export type AppChatConfigType = z.infer<typeof AppChatConfigSchema>;

export const PluginDataSchema = z
  .object({
    nodeVersion: z.string().optional().describe('节点版本'),
    pluginUniId: z.string().optional().describe('插件唯一标识'),
    apiSchemaStr: z.string().optional().describe('API Schema 字符串(HTTP 插件)'),
    customHeaders: z.string().optional().describe('自定义请求头(HTTP 插件)')
  })
  .optional()
  .describe('插件数据配置');
export type PluginDataType = z.infer<typeof PluginDataSchema>;

export const AppListParamsSchema = z
  .object({
    parentId: ParentIdSchema.optional().describe('父级 ID').openapi({ example: null }),
    type: z
      .union([AppTypeSchema, z.array(AppTypeSchema)])
      .optional()
      .describe('应用类型')
      .openapi({ example: AppTypeSchema.enum.simple }),
    getRecentlyChat: z
      .boolean()
      .optional()
      .describe('是否获取最近聊天的应用')
      .openapi({ example: true }),
    searchKey: z
      .string()
      .optional()
      .describe('搜索关键字（应用名称或简介）')
      .openapi({ example: '' })
  })
  .describe('获取应用列表请求参数');
export type AppListParams = z.infer<typeof AppListParamsSchema>;
export const AppListItemSchema = z
  .object({
    _id: ObjectIdSchema.describe('应用 ID'),
    parentId: ParentIdSchema,
    tmbId: ObjectIdSchema.describe('团队成员 ID'),
    name: z.string().min(1).max(30).describe('应用名称'),
    avatar: z.string().describe('应用头像 URL'),
    intro: z.string().describe('应用简介'),
    type: AppTypeSchema.describe('应用类型'),
    updateTime: DateTimeSchema.describe('更新时间'),
    pluginData: PluginDataSchema,
    permission: PermissionSchema,
    inheritPermission: z.boolean().optional().describe('是否继承权限'),
    private: z.boolean().optional().describe('是否为私有应用'),
    sourceMember: SourceMemberSchema.describe('应用创建者信息'),
    hasInteractiveNode: z.boolean().optional().describe('是否包含交互节点')
  })
  .describe('应用列表项');
export type AppListItemType = z.infer<typeof AppListItemSchema>;
export const AppListResponseSchema = createCommonResponseSchema(z.array(AppListItemSchema));
export type AppListResponseType = z.infer<typeof AppListResponseSchema>;

export type AppSchema = {
  _id: string;
  parentId?: ParentIdType;
  teamId: string;
  tmbId: string;
  type: AppTypeEnum;
  version?: 'v1' | 'v2';

  name: string;
  avatar: string;
  intro: string;

  updateTime: Date;

  modules: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  pluginData?: {
    nodeVersion?: string;
    pluginUniId?: string; // plugin unique id(plugin name)
    apiSchemaStr?: string; // api schema string
    customHeaders?: string;
  };

  // App system config
  chatConfig: AppChatConfigType;
  scheduledTriggerConfig?: AppScheduledTriggerConfigType | null;
  scheduledTriggerNextTime?: Date;

  inited?: boolean;
  teamTags: string[];
  inheritPermission?: boolean;

  // if access the app by favourite or quick
  favourite?: boolean;
  quick?: boolean;

  // abandon
  defaultPermission?: number;
};

export type AppListItemType = {
  _id: string;
  parentId: ParentIdType;
  tmbId: string;
  name: string;
  avatar: string;
  intro: string;
  type: AppTypeEnum;
  updateTime: Date;
  pluginData?: AppSchema['pluginData'];
  permission: AppPermission;
  inheritPermission?: boolean;
  private?: boolean;
  sourceMember: SourceMemberType;
  hasInteractiveNode?: boolean;
};

export type AppDetailType = AppSchema & {
  permission: AppPermission;
};

export type AppDatasetSearchParamsType = {
  searchMode: `${DatasetSearchModeEnum}`;
  limit?: number; // limit max tokens
  similarity?: number;
  embeddingWeight?: number; // embedding weight, fullText weight = 1 - embeddingWeight

  usingReRank?: boolean;
  rerankModel?: string;
  rerankWeight?: number;

  datasetSearchUsingExtensionQuery?: boolean;
  datasetSearchExtensionModel?: string;
  datasetSearchExtensionBg?: string;
};
export type AppSimpleEditFormType = {
  // templateId: string;
  aiSettings: {
    [NodeInputKeyEnum.aiModel]: string;
    [NodeInputKeyEnum.aiSystemPrompt]?: string | undefined;
    [NodeInputKeyEnum.aiChatTemperature]?: number;
    [NodeInputKeyEnum.aiChatMaxToken]?: number;
    [NodeInputKeyEnum.aiChatIsResponseText]: boolean;
    maxHistories: number;
    [NodeInputKeyEnum.aiChatReasoning]?: boolean; // Is open reasoning mode
    [NodeInputKeyEnum.aiChatTopP]?: number;
    [NodeInputKeyEnum.aiChatStopSign]?: string;
    [NodeInputKeyEnum.aiChatResponseFormat]?: string;
    [NodeInputKeyEnum.aiChatJsonSchema]?: string;
  };
  dataset: {
    datasets: SelectedDatasetType;
  } & AppDatasetSearchParamsType;
  selectedTools: FlowNodeTemplateType[];
  chatConfig: AppChatConfigType;
};

export type McpToolConfigType = {
  name: string;
  description: string;
  inputSchema: JSONSchemaInputType;
};

/* app chat config type */
export type AppChatConfigType = {
  welcomeText?: string;
  variables?: VariableItemType[];
  autoExecute?: AppAutoExecuteConfigType;
  questionGuide?: AppQGConfigType;
  ttsConfig?: AppTTSConfigType;
  whisperConfig?: AppWhisperConfigType;
  scheduledTriggerConfig?: AppScheduledTriggerConfigType;
  chatInputGuide?: ChatInputGuideConfigType;
  fileSelectConfig?: AppFileSelectConfigType;

  // plugin
  instruction?: string;
};
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

// variable
export type VariableItemType = {
  // id: string;
  key: string;
  label: string;
  type: VariableInputEnum;
  required: boolean;
  description: string;
  valueType?: WorkflowIOValueType;
  defaultValue?: any;

  // input
  maxLength?: number;
  // password
  minLength?: number;
  // numberInput
  max?: number;
  min?: number;
  // select
  list?: { label: string; value: string }[];
  // file
  canSelectFile?: boolean;
  canSelectImg?: boolean;
  maxFiles?: number;
  // timeSelect
  timeGranularity?: 'second' | 'minute' | 'hour' | 'day';
  timeType?: 'point' | 'range';
  timeRangeStart?: string;
  timeRangeEnd?: string;

  // @deprecated
  enums?: { value: string; label: string }[];
};
// tts
export type AppTTSConfigType = {
  type: 'none' | 'web' | 'model';
  model?: string;
  voice?: string;
  speed?: number;
};
// whisper
export type AppWhisperConfigType = {
  open: boolean;
  autoSend: boolean;
  autoTTSResponse: boolean;
};

// question guide
export type AppQGConfigType = {
  open: boolean;
  model?: string;
  customPrompt?: string;
};

// question guide text
export type ChatInputGuideConfigType = {
  open: boolean;
  customUrl: string;
};
// interval timer
export type AppScheduledTriggerConfigType = {
  cronString: string;
  timezone: string;
  defaultPrompt: string;
};
// auto execute
export type AppAutoExecuteConfigType = {
  open: boolean;
  defaultPrompt: string;
};
// File
export type AppFileSelectConfigType = {
  canSelectFile: boolean;
  customPdfParse?: boolean;
  canSelectImg: boolean;
  maxFiles: number;
};

export type SystemPluginListItemType = {
  _id: string;
  name: string;
  avatar: string;
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
  userGuide?: {
    type: 'markdown' | 'link';
    content?: string;
    link?: string;
  };
  isQuickTemplate?: boolean;
  order?: number;
  workflow: WorkflowTemplateBasicType;
};

export type TemplateTypeSchemaType = {
  typeName: string;
  typeId: string;
  typeOrder: number;
};
