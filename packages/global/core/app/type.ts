import { StoreNodeItemTypeSchema } from '../workflow/type/node';
import { AppTypeEnum } from './constants';
import type { NodeInputKeyEnum } from '../workflow/constants';
import { VariableInputEnum } from '../workflow/constants';
import { InputComponentPropsTypeSchema } from '../workflow/type/io';
import { DatasetSearchModeEnum } from '../dataset/constants';
import type { ReasoningEffort } from '../ai/llm/type';
import { StoreEdgeItemTypeSchema } from '../workflow/type/edge';
import type { AppPermission } from '../../support/permission/app/controller';
import { ParentIdSchema, type ParentIdType } from '../../common/parentFolder/type';
import type { WorkflowTemplateBasicType } from '../workflow/type';
import { UserTagsSchema, type SourceMemberType } from '../../support/user/type';
import z from 'zod';
import { ObjectIdSchema } from '../../common/type/mongo';
import { AppFileSelectConfigTypeSchema } from './type/config.schema';
import { BoolSchema, NumSchema } from '../../common/zod';

// variable
export const VariableItemTypeSchema = AppFileSelectConfigTypeSchema.extend(
  InputComponentPropsTypeSchema.shape
).extend({
  type: z.enum(VariableInputEnum).meta({
    description: '变量输入组件类型'
  }),
  description: z.string().meta({
    description: '变量用途说明'
  })
});
export type VariableItemType = z.infer<typeof VariableItemTypeSchema>;

// tts
export const AppTTSConfigTypeSchema = z.object({
  type: z.enum(['none', 'web', 'model']).meta({
    description: '语音播报方式：关闭、浏览器播报或模型播报'
  }),
  model: z.string().optional().meta({
    description: '模型播报时使用的语音模型'
  }),
  voice: z.string().optional().meta({
    description: '模型播报时使用的音色'
  }),
  speed: NumSchema.optional().meta({
    description: '语音播报速度'
  })
});
export type AppTTSConfigType = z.infer<typeof AppTTSConfigTypeSchema>;

// whisper
export const AppWhisperConfigTypeSchema = z.object({
  open: BoolSchema.meta({
    description: '是否开启语音输入识别'
  }),
  autoSend: BoolSchema.meta({
    description: '语音识别完成后是否自动发送问题'
  }),
  autoTTSResponse: BoolSchema.meta({
    description: '语音输入后是否自动播报应用回复'
  })
});
export type AppWhisperConfigType = z.infer<typeof AppWhisperConfigTypeSchema>;

// question guide
export const AppQGConfigTypeSchema = z.preprocess(
  (val) => {
    // 兼容旧版 chatConfig.questionGuide: boolean，schema 输出仍保持对象形态。
    if (typeof val === 'boolean') {
      return {
        open: val
      };
    }

    return val;
  },
  z.object({
    open: BoolSchema.meta({
      description: '是否开启问题引导'
    }),
    model: z.string().optional().meta({
      description: '生成问题引导时使用的模型'
    }),
    customPrompt: z.string().optional().meta({
      description: '生成问题引导时追加的自定义提示词'
    })
  })
);
export type AppQGConfigType = z.infer<typeof AppQGConfigTypeSchema>;

// question guide text
export const ChatInputGuideConfigTypeSchema = z.object({
  open: BoolSchema.meta({
    description: '是否开启对话输入引导'
  }),
  customUrl: z.string().meta({
    description: '自定义输入引导页面地址'
  })
});
export type ChatInputGuideConfigType = z.infer<typeof ChatInputGuideConfigTypeSchema>;

// interval timer
export const AppScheduledTriggerConfigTypeSchema = z.object({
  cronString: z.string().meta({
    description: '定时触发表达式'
  }),
  timezone: z.string().meta({
    description: '定时触发使用的时区'
  }),
  defaultPrompt: z.string().meta({
    description: '定时触发时注入的默认用户问题'
  })
});
export type AppScheduledTriggerConfigType = z.infer<typeof AppScheduledTriggerConfigTypeSchema>;

// auto execute
export const AppAutoExecuteConfigTypeSchema = z.object({
  open: BoolSchema.meta({
    description: '是否在进入会话后自动触发应用执行'
  }),
  defaultPrompt: z.string().meta({
    description: '自动执行时注入的默认用户问题'
  })
});
export type AppAutoExecuteConfigType = z.infer<typeof AppAutoExecuteConfigTypeSchema>;

export const AppChatConfigTypeSchema = z.object({
  welcomeText: z.string().optional().meta({
    description: '新会话开始时展示给用户的欢迎语'
  }),
  variables: z.array(VariableItemTypeSchema).optional().meta({
    description: '应用启动对话前需要用户填写的变量列表'
  }),
  autoExecute: AppAutoExecuteConfigTypeSchema.optional().meta({
    description: '自动执行配置'
  }),
  questionGuide: AppQGConfigTypeSchema.optional().meta({
    description: '问题引导配置'
  }),
  ttsConfig: AppTTSConfigTypeSchema.optional().meta({
    description: '语音播报配置'
  }),
  whisperConfig: AppWhisperConfigTypeSchema.optional().meta({
    description: '语音输入配置'
  }),
  scheduledTriggerConfig: AppScheduledTriggerConfigTypeSchema.optional().meta({
    description: '定时触发配置'
  }),
  chatInputGuide: ChatInputGuideConfigTypeSchema.optional().meta({
    description: '对话输入引导配置'
  }),
  fileSelectConfig: AppFileSelectConfigTypeSchema.optional().meta({
    description: '对话文件选择配置'
  }),
  instruction: z.string().optional().meta({
    description: '应用对话页展示给用户的使用说明'
  })
});
export type AppChatConfigType = z.infer<typeof AppChatConfigTypeSchema>;

export const AppResourceRefsSchema = z.object({
  skillIds: z.array(z.string()).default([]).meta({
    description: '应用发布版本引用的技能 ID 列表'
  })
});
export type AppResourceRefsType = z.infer<typeof AppResourceRefsSchema>;

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

  updateTime: z.coerce.date(),

  modules: z.array(StoreNodeItemTypeSchema),
  edges: z.array(StoreEdgeItemTypeSchema),
  pluginData: z
    .object({
      nodeVersion: z.string().optional().meta({
        description: '当前应用保存或发布时对应的版本记录 ID'
      }),
      pluginUniId: z.string().optional().meta({
        description: '插件唯一标识，用于兼容旧版插件应用'
      }),
      apiSchemaStr: z.string().optional().meta({
        description: 'HTTP 工具集导入的 OpenAPI Schema 原始内容'
      }),
      customHeaders: z.string().optional().meta({
        description: 'HTTP 工具集配置的公共请求头 JSON 字符串'
      })
    })
    .optional()
    .meta({
      description: '应用扩展配置，主要用于工具集和旧版插件应用'
    }),

  // App system config
  chatConfig: AppChatConfigTypeSchema,
  scheduledTriggerConfig: AppScheduledTriggerConfigTypeSchema.optional(),
  scheduledTriggerNextTime: z.coerce.date().optional(),
  resourceRefs: AppResourceRefsSchema.optional(),
  inheritPermission: BoolSchema.optional(),

  // if access the app by favourite or quick
  favourite: BoolSchema.optional(),
  quick: BoolSchema.optional(),

  // 软删除字段
  deleteTime: z.coerce.date().nullish(),

  defaultPermission: NumSchema.optional().meta({
    deprecated: true
  }),
  inited: BoolSchema.optional().meta({
    deprecated: true
  }),
  teamTags: z.array(z.string()).optional().meta({
    deprecated: true
  })
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
  limit: NumSchema.optional(), // limit max tokens
  similarity: NumSchema.optional(),
  embeddingWeight: NumSchema.optional(), // embedding weight, fullText weight = 1 - embeddingWeight

  usingReRank: BoolSchema.optional(),
  rerankModel: z.string().optional(),
  rerankWeight: NumSchema.optional(),

  datasetSearchUsingExtensionQuery: BoolSchema.optional(),
  datasetSearchExtensionModel: z.string().optional(),
  datasetSearchExtensionBg: z.string().optional(),

  collectionFilterMatch: z.string().optional()
});
export type AppDatasetSearchParamsType = z.infer<typeof AppDatasetSearchParamsTypeSchema>;

export type SettingAIDataType = {
  model: string;
  temperature?: number;
  maxToken?: number;
  isResponseAnswerText?: boolean;
  maxHistories?: number;
  [NodeInputKeyEnum.aiChatVision]?: boolean; // Is open vision mode
  [NodeInputKeyEnum.aiChatAudio]?: boolean; // Is open audio recognition mode
  [NodeInputKeyEnum.aiChatVideo]?: boolean; // Is open video recognition mode
  [NodeInputKeyEnum.aiChatExtractFiles]?: boolean; // Parse multimodal links from user question
  [NodeInputKeyEnum.aiChatReasoning]?: boolean; // Is open reasoning mode
  [NodeInputKeyEnum.aiChatReasoningEffort]?: ReasoningEffort;
  [NodeInputKeyEnum.aiChatTopP]?: number;
  [NodeInputKeyEnum.aiChatStopSign]?: string;
  [NodeInputKeyEnum.aiChatResponseFormat]?: string;
  [NodeInputKeyEnum.aiChatJsonSchema]?: string;
};

export const AppTemplateSchema = z.object({
  templateId: z.string().meta({
    example: 'template-simple-chat',
    description: '模板 ID'
  }),
  name: z.string().meta({
    example: '客服助手',
    description: '模板名称'
  }),
  intro: z.string().meta({
    description: '模板介绍'
  }),
  avatar: z.string().meta({
    description: '模板头像'
  }),
  tags: z.array(z.string()).meta({
    description: '模板标签'
  }),
  type: z.string().meta({
    example: AppTypeEnum.workflow,
    description: '应用类型'
  }),
  author: z.string().optional().meta({
    description: '作者'
  }),
  isActive: BoolSchema.optional().meta({
    description: '是否启用'
  }),
  isPromoted: BoolSchema.optional().meta({
    description: '是否推荐'
  }),
  promoteTags: z.array(UserTagsSchema).optional().meta({
    description: '推荐用户标签'
  }),
  hideTags: z.array(UserTagsSchema).optional().meta({
    description: '隐藏用户标签'
  }),
  recommendText: z.string().optional().meta({
    description: '推荐文案'
  }),
  userGuide: z
    .object({
      type: z.enum(['markdown', 'link']).meta({
        example: 'markdown',
        description: '用户指引展示方式'
      }),
      content: z.string().optional().meta({
        description: 'Markdown 类型用户指引内容'
      }),
      link: z.string().optional().meta({
        description: '外链类型用户指引地址'
      })
    })
    .optional()
    .meta({
      description: '用户指引'
    }),
  isQuickTemplate: BoolSchema.optional().meta({
    description: '是否快捷模板'
  }),
  order: NumSchema.optional().meta({
    description: '排序值'
  }),
  // TODO: 对于 chat agent，是另一个格式。
  workflow: z
    .custom<WorkflowTemplateBasicType>(() => true)
    .meta({
      description: '模板对应的应用编排配置；不同应用类型可能使用不同结构'
    })
});
export type AppTemplateSchemaType = z.infer<typeof AppTemplateSchema>;

export type TemplateTypeSchemaType = {
  typeName: string;
  typeId: string;
  typeOrder: number;
};
