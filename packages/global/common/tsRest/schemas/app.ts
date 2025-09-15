import { z } from '../z';
import {
  ObjectIdSchema,
  ParentIdSchema,
  DateTimeSchema,
  OptionalDateTimeSchema,
  PermissionSchema,
  SourceMemberSchema,
  UtmParamsSchema
} from './common';

// =============================== entity schemas ===============================

export const AppTypeSchema = z
  .enum(['folder', 'simple', 'advanced', 'plugin', 'httpPlugin', 'toolSet', 'tool', 'hidden'])
  .describe(
    '应用类型：folder-文件夹, simple-简单应用, advanced-高级工作流, plugin-插件, httpPlugin-HTTP插件, toolSet-工具集, tool-工具, hidden-隐藏应用'
  );

// 变量输入类型
export const VariableInputTypeSchema = z
  .enum(['input', 'textarea', 'number', 'select', 'switch', 'file', 'JSONEditor'])
  .describe('变量输入类型');

// 工作流IO值类型
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
    'any'
  ])
  .describe('工作流IO值类型');

// 变量配置
export const VariableItemSchema = z
  .object({
    key: z.string().min(1).describe('变量标识符'),
    label: z.string().min(1).describe('变量显示名称'),
    type: VariableInputTypeSchema.describe('变量输入类型'),
    required: z.boolean().describe('是否必填'),
    description: z.string().describe('变量描述'),
    valueType: WorkflowIOValueTypeSchema.optional().describe('值类型'),
    defaultValue: z.any().optional().describe('默认值'),
    // input 类型相关
    maxLength: z.number().positive().optional().describe('输入最大长度'),
    // number 类型相关
    max: z.number().optional().describe('数值最大值'),
    min: z.number().optional().describe('数值最小值'),
    // select 类型相关
    list: z
      .array(
        z.object({
          label: z.string().describe('选项显示文本'),
          value: z.string().describe('选项值')
        })
      )
      .optional()
      .describe('选择项列表'),
    // 废弃字段
    enums: z
      .array(
        z.object({
          value: z.string(),
          label: z.string()
        })
      )
      .optional()
      .describe('已废弃的枚举选项')
  })
  .describe('应用变量配置项');

// TTS 配置
export const AppTTSConfigSchema = z
  .object({
    type: z.enum(['none', 'web', 'model']).describe('TTS 类型'),
    model: z.string().optional().describe('TTS 模型'),
    voice: z.string().optional().describe('语音类型'),
    speed: z.number().min(0.1).max(3).optional().describe('语音速度')
  })
  .describe('文字转语音配置');

// 语音识别配置
export const AppWhisperConfigSchema = z
  .object({
    open: z.boolean().describe('是否启用语音输入'),
    autoSend: z.boolean().describe('是否自动发送'),
    autoTTSResponse: z.boolean().describe('是否自动语音回复')
  })
  .describe('语音识别配置');

// 问题引导配置
export const AppQGConfigSchema = z
  .object({
    open: z.boolean().describe('是否启用问题引导'),
    model: z.string().optional().describe('引导问题生成模型'),
    customPrompt: z.string().optional().describe('自定义引导词')
  })
  .describe('问题引导配置');

// 自动执行配置
export const AppAutoExecuteConfigSchema = z
  .object({
    open: z.boolean().describe('是否启用自动执行'),
    defaultPrompt: z.string().describe('默认提示词')
  })
  .describe('自动执行配置');

// 聊天输入引导配置
export const ChatInputGuideConfigSchema = z
  .object({
    open: z.boolean().describe('是否启用输入引导'),
    customUrl: z.string().describe('自定义引导链接')
  })
  .describe('聊天输入引导配置');

// 文件选择配置
export const AppFileSelectConfigSchema = z
  .object({
    canSelectFile: z.boolean().describe('是否可选择文件'),
    customPdfParse: z.boolean().optional().describe('是否自定义PDF解析'),
    canSelectImg: z.boolean().describe('是否可选择图片'),
    maxFiles: z.number().positive().describe('最大文件数量')
  })
  .describe('文件选择配置');

// 定时触发配置
export const ScheduledTriggerConfigSchema = z
  .object({
    cronString: z.string().min(1).describe('Cron 表达式'),
    timezone: z.string().min(1).describe('时区'),
    defaultPrompt: z.string().describe('默认触发提示词')
  })
  .describe('定时触发配置');

// App 聊天配置
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

// 插件数据
export const PluginDataSchema = z
  .object({
    nodeVersion: z.string().optional().describe('节点版本'),
    pluginUniId: z.string().optional().describe('插件唯一标识'),
    apiSchemaStr: z.string().optional().describe('API Schema 字符串（HTTP 插件）'),
    customHeaders: z.string().optional().describe('自定义请求头（HTTP 插件）')
  })
  .optional()
  .describe('插件数据配置');

// App 列表项
export const AppListItemSchema = z
  .object({
    _id: ObjectIdSchema.describe('应用ID'),
    parentId: ParentIdSchema.describe('父级ID（文件夹ID或null）'),
    tmbId: ObjectIdSchema.describe('团队成员ID'),
    name: z.string().min(1).max(30).describe('应用名称'),
    avatar: z.string().describe('应用头像URL'),
    intro: z.string().describe('应用简介'),
    type: AppTypeSchema.describe('应用类型'),
    updateTime: DateTimeSchema.describe('更新时间'),
    pluginData: PluginDataSchema.describe('插件相关数据'),
    permission: PermissionSchema.describe('用户对该应用的权限'),
    inheritPermission: z.boolean().optional().describe('是否继承权限'),
    private: z.boolean().optional().describe('是否为私有应用'),
    sourceMember: SourceMemberSchema.describe('应用创建者信息'),
    hasInteractiveNode: z.boolean().optional().describe('是否包含交互节点')
  })
  .describe('应用列表项');

// App 详情
export const AppDetailSchema = z
  .object({
    _id: ObjectIdSchema.describe('应用ID'),
    parentId: ParentIdSchema.describe('父级ID（文件夹ID或null）'),
    teamId: ObjectIdSchema.describe('团队ID'),
    tmbId: ObjectIdSchema.describe('团队成员ID'),
    type: AppTypeSchema.describe('应用类型'),
    version: z.enum(['v1', 'v2']).optional().describe('应用版本'),
    name: z.string().min(1).max(30).describe('应用名称'),
    avatar: z.string().describe('应用头像URL'),
    intro: z.string().describe('应用简介'),
    updateTime: DateTimeSchema.describe('更新时间'),
    modules: z.array(z.any()).describe('工作流节点数据（复杂对象）'),
    edges: z.array(z.any()).describe('工作流连接线数据（复杂对象）'),
    pluginData: PluginDataSchema.describe('插件相关数据'),
    chatConfig: AppChatConfigSchema.describe('聊天配置'),
    scheduledTriggerConfig: ScheduledTriggerConfigSchema.optional().describe('定时触发配置'),
    scheduledTriggerNextTime: OptionalDateTimeSchema.describe('下次定时触发时间'),
    inited: z.boolean().optional().describe('是否已初始化'),
    teamTags: z.array(z.string()).describe('团队标签列表'),
    inheritPermission: z.boolean().optional().default(true).describe('是否继承权限'),
    favourite: z.boolean().optional().describe('是否为收藏应用'),
    quick: z.boolean().optional().describe('是否为快捷应用'),
    permission: PermissionSchema.describe('用户对该应用的权限')
  })
  .describe('应用详情');

// App 版本项
export const AppVersionListItemSchema = z
  .object({
    _id: ObjectIdSchema.describe('版本ID'),
    appId: ObjectIdSchema.describe('应用ID'),
    nodes: z.array(z.any()).describe('工作流节点数据'),
    edges: z.array(z.any()).describe('工作流连接线数据'),
    chatConfig: AppChatConfigSchema.describe('聊天配置'),
    isPublish: z.boolean().describe('是否已发布'),
    versionName: z.string().optional().describe('版本名称'),
    time: DateTimeSchema.describe('创建时间'),
    tmbId: ObjectIdSchema.describe('创建者团队成员ID'),
    sourceMember: SourceMemberSchema.describe('创建者信息')
  })
  .describe('应用版本列表项');

// App 日志项
export const AppLogItemSchema = z
  .object({
    _id: ObjectIdSchema.describe('日志记录ID'),
    id: z.string().describe('聊天会话ID'),
    title: z.string().optional().describe('会话标题'),
    customTitle: z.string().optional().describe('自定义标题'),
    source: z.string().describe('来源类型'),
    sourceName: z.string().optional().describe('来源名称'),
    updateTime: DateTimeSchema.describe('更新时间'),
    createTime: DateTimeSchema.describe('创建时间'),
    messageCount: z.number().min(0).describe('消息总数'),
    userGoodFeedbackCount: z.number().min(0).describe('用户好评数'),
    userBadFeedbackCount: z.number().min(0).describe('用户差评数'),
    customFeedbacksCount: z.number().min(0).describe('自定义反馈数'),
    markCount: z.number().min(0).describe('管理员标记数'),
    averageResponseTime: z.number().min(0).describe('平均响应时间（秒）'),
    errorCount: z.number().min(0).describe('错误次数'),
    totalPoints: z.number().min(0).describe('总消耗积分'),
    outLinkUid: z.string().optional().describe('外链用户ID'),
    tmbId: ObjectIdSchema.optional().describe('团队成员ID'),
    sourceMember: SourceMemberSchema.optional().describe('用户信息')
  })
  .describe('应用聊天日志项');

// =============================== request schemas ===============================

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

export const AppDetailRequestSchema = z
  .object({
    appId: ObjectIdSchema.describe('应用 ID')
  })
  .describe('获取应用详情请求参数');

export const CreateAppRequestSchema = z
  .object({
    parentId: ParentIdSchema.optional().describe('父级 ID'),
    name: z.string().min(1, '应用名称不能为空').max(30).describe('应用名称'),
    avatar: z.string().optional().describe('应用头像'),
    type: AppTypeSchema.describe('应用类型'),
    modules: z.array(z.any()).describe('工作流节点数据'),
    edges: z.array(z.any()).optional().describe('工作流连接线数据'),
    chatConfig: AppChatConfigSchema.optional().describe('聊天配置'),
    utmParams: UtmParamsSchema.optional().describe('UTM 参数')
  })
  .describe('创建应用请求参数');

export const CreateAppFolderRequestSchema = z.object({
  parentId: ParentIdSchema.optional(),
  name: z.string().min(1).max(30),
  intro: z.string().optional()
});

export const UpdateAppRequestSchema = z.object({
  appId: ObjectIdSchema,
  parentId: ParentIdSchema.optional(),
  name: z.string().min(1).max(30).optional(),
  type: AppTypeSchema.optional(),
  avatar: z.string().optional(),
  intro: z.string().optional(),
  nodes: z.array(z.any()).optional(),
  edges: z.array(z.any()).optional(),
  chatConfig: AppChatConfigSchema.optional(),
  teamTags: z.array(z.string()).optional()
});

export const DeleteAppRequestSchema = z.object({
  appId: ObjectIdSchema
});

export const PublishVersionRequestSchema = z.object({
  nodes: z.array(z.any()),
  edges: z.array(z.any()),
  chatConfig: AppChatConfigSchema,
  isPublish: z.boolean().optional(),
  versionName: z.string().optional(),
  autoSave: z.boolean().optional()
});

export const VersionListRequestSchema = z.object({
  appId: ObjectIdSchema,
  isPublish: z.boolean().optional()
});

export const ChatLogsRequestSchema = z.object({
  appId: ObjectIdSchema,
  dateStart: OptionalDateTimeSchema,
  dateEnd: OptionalDateTimeSchema,
  sources: z.array(z.string()).optional(),
  tmbIds: z.array(ObjectIdSchema).optional(),
  chatSearch: z.string().optional()
});

// 响应 schemas
export const AppListResponseSchema = z.array(AppListItemSchema);
export type AppListItemType = z.infer<typeof AppListItemSchema>;

export const AppDetailResponseSchema = AppDetailSchema;
export const CreateAppResponseSchema = ObjectIdSchema;
export const DeleteAppResponseSchema = z.array(z.string());
export const UpdateAppResponseSchema = z.void();
export const PublishVersionResponseSchema = z.void();
export const ExportChatLogsResponseSchema = z.string();
