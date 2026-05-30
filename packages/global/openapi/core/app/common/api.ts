import { ObjectIdSchema } from '../../../../common/type/mongo';
import { ParentIdSchema } from '../../../../common/parentFolder/type';
import { AppTypeEnum } from '../../../../core/app/constants';
import {
  AppChatConfigTypeSchema,
  VariableItemTypeSchema,
  AppSchemaTypeSchema,
  type AppDetailType,
  type AppListItemType
} from '../../../../core/app/type';
import { ShortUrlSchema } from '../../../../support/marketing/type';
import type { AppPermission } from '../../../../support/permission/app/controller';
import { SourceMemberSchema } from '../../../../support/user/type';
import { OpenAPIStoreNodeItemTypeSchema } from '../../workflow/node';
import z from 'zod';

const AppIdSchema = ObjectIdSchema.meta({
  example: '68ad85a7463006c963799a05',
  description: '应用 ID'
});

const EmptyObjectResponseSchema = z.object({}).meta({
  description: '操作成功'
});

const AppPermissionSchema = z
  .custom<AppPermission>(() => true)
  .meta({
    description: '应用权限对象（AppPermission 类实例）'
  });

const emptyObjectToUndefined = (value: unknown) => {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).length === 0
  ) {
    return undefined;
  }

  return value;
};

const AppPluginDataSchema = z
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
  });

const OpenAPIAppEdgeItemSchema = z
  .object({
    source: z.string().meta({
      description: '连线起点节点 ID'
    }),
    sourceHandle: z.string().meta({
      description: '连线起点输出桩 ID'
    }),
    target: z.string().meta({
      description: '连线终点节点 ID'
    }),
    targetHandle: z.string().meta({
      description: '连线终点输入桩 ID'
    })
  })
  .meta({
    description: '应用工作流连线'
  });

export const OpenAPIAppEdgesSchema = z.array(OpenAPIAppEdgeItemSchema).meta({
  description: '应用工作流节点之间的连线配置'
});

const OpenAPIAppFileSelectConfigSchema = z
  .object({
    maxFiles: z.number().optional().meta({
      description: '单次对话允许选择的最大文件数量'
    }),
    canSelectFile: z.boolean().optional().meta({
      description: '是否允许在对话中选择普通文件'
    }),
    customPdfParse: z.boolean().optional().meta({
      description: '是否使用自定义 PDF 解析配置'
    }),
    canSelectImg: z.boolean().optional().meta({
      description: '是否允许在对话中选择图片'
    }),
    canSelectVideo: z.boolean().optional().meta({
      description: '是否允许在对话中选择视频'
    }),
    canSelectAudio: z.boolean().optional().meta({
      description: '是否允许在对话中选择音频'
    }),
    canSelectCustomFileExtension: z.boolean().optional().meta({
      description: '是否允许选择自定义扩展名的文件'
    }),
    customFileExtensionList: z.array(z.string()).optional().meta({
      description: '允许选择的自定义文件扩展名列表'
    })
  })
  .meta({
    description: '对话文件选择配置'
  });

const OpenAPIAutoExecuteConfigSchema = z
  .object({
    open: z.boolean().meta({
      description: '是否在进入会话后自动触发应用执行'
    }),
    defaultPrompt: z.string().meta({
      description: '自动执行时注入的默认用户问题'
    })
  })
  .meta({
    description: '自动执行配置'
  });

const OpenAPIQuestionGuideConfigSchema = z
  .object({
    open: z.boolean().meta({
      description: '是否开启问题引导'
    }),
    model: z.string().optional().meta({
      description: '生成问题引导时使用的模型'
    }),
    customPrompt: z.string().optional().meta({
      description: '生成问题引导时追加的自定义提示词'
    })
  })
  .meta({
    description: '问题引导配置'
  });

const OpenAPIAppTTSConfigSchema = z
  .object({
    type: z.enum(['none', 'web', 'model']).meta({
      description: '语音播报方式：关闭、浏览器播报或模型播报'
    }),
    model: z.string().optional().meta({
      description: '模型播报时使用的语音模型'
    }),
    voice: z.string().optional().meta({
      description: '模型播报时使用的音色'
    }),
    speed: z.number().optional().meta({
      description: '语音播报速度'
    })
  })
  .meta({
    description: '语音播报配置'
  });

const OpenAPIAppWhisperConfigSchema = z
  .object({
    open: z.boolean().meta({
      description: '是否开启语音输入识别'
    }),
    autoSend: z.boolean().meta({
      description: '语音识别完成后是否自动发送问题'
    }),
    autoTTSResponse: z.boolean().meta({
      description: '语音输入后是否自动播报应用回复'
    })
  })
  .meta({
    description: '语音输入配置'
  });

const OpenAPIAppScheduledTriggerConfigFieldsSchema = z
  .object({
    cronString: z.string().meta({
      description: '定时触发表达式'
    }),
    timezone: z.string().meta({
      description: '定时触发使用的时区'
    }),
    defaultPrompt: z.string().meta({
      description: '定时触发时注入的默认用户问题'
    })
  })
  .meta({
    description: '应用定时触发配置'
  });

export const OpenAPIAppScheduledTriggerConfigSchema = z
  .preprocess(emptyObjectToUndefined, OpenAPIAppScheduledTriggerConfigFieldsSchema.optional())
  .meta({
    description: '应用定时触发配置'
  });

const OpenAPIChatInputGuideConfigSchema = z
  .object({
    open: z.boolean().meta({
      description: '是否开启对话输入引导'
    }),
    customUrl: z.string().meta({
      description: '自定义输入引导页面地址'
    })
  })
  .meta({
    description: '对话输入引导配置'
  });

const OpenAPIVariableSelectOptionSchema = z
  .object({
    label: z.string().meta({
      description: '变量选项展示名称'
    }),
    value: z.string().meta({
      description: '变量选项实际值'
    }),
    icon: z.string().optional().meta({
      description: '变量选项图标'
    }),
    description: z.string().optional().meta({
      description: '变量选项说明'
    })
  })
  .meta({
    description: '变量可选项'
  });

const OpenAPIVariableMarkItemSchema = z
  .object({
    label: z.string().meta({
      description: '刻度展示名称'
    }),
    value: z.number().meta({
      description: '刻度值'
    })
  })
  .meta({
    description: '数值滑块刻度'
  });

const OpenAPIVariableDatasetOptionSchema = z
  .object({
    datasetId: z.string().meta({
      description: '可选知识库 ID'
    }),
    avatar: z.string().meta({
      description: '可选知识库头像'
    }),
    name: z.string().meta({
      description: '可选知识库名称'
    }),
    vectorModel: z
      .object({
        model: z.string().meta({
          description: '知识库使用的向量模型'
        })
      })
      .meta({
        description: '知识库向量模型配置'
      })
  })
  .meta({
    description: '变量可选择的知识库'
  });

const OpenAPIVariableCustomInputConfigSchema = z
  .object({
    selectValueTypeList: VariableItemTypeSchema.shape.customInputConfig
      .unwrap()
      .shape.selectValueTypeList.meta({
        description: '自定义输入允许选择的数据类型列表'
      }),
    showDefaultValue: VariableItemTypeSchema.shape.customInputConfig
      .unwrap()
      .shape.showDefaultValue.meta({
        description: '是否在编辑器中展示默认值配置'
      }),
    showDescription: VariableItemTypeSchema.shape.customInputConfig
      .unwrap()
      .shape.showDescription.meta({
        description: '是否在编辑器中展示字段说明配置'
      }),
    hideBottomDivider: VariableItemTypeSchema.shape.customInputConfig
      .unwrap()
      .shape.hideBottomDivider.meta({
        description: '是否隐藏变量编辑区域底部分割线'
      })
  })
  .meta({
    description: '自定义变量输入配置'
  });

const OpenAPIVariableEnumItemSchema = z
  .object({
    value: z.string().meta({
      description: '枚举项实际值'
    }),
    label: z.string().meta({
      description: '枚举项展示名称'
    })
  })
  .meta({
    description: '变量枚举项'
  });

const OpenAPIVariableItemSchema = VariableItemTypeSchema.extend({
  maxFiles: VariableItemTypeSchema.shape.maxFiles.meta({
    description: '该变量允许选择的最大文件数量'
  }),
  canSelectFile: VariableItemTypeSchema.shape.canSelectFile.meta({
    description: '该变量是否允许选择普通文件'
  }),
  customPdfParse: VariableItemTypeSchema.shape.customPdfParse.meta({
    description: '该变量是否使用自定义 PDF 解析配置'
  }),
  canSelectImg: VariableItemTypeSchema.shape.canSelectImg.meta({
    description: '该变量是否允许选择图片'
  }),
  canSelectVideo: VariableItemTypeSchema.shape.canSelectVideo.meta({
    description: '该变量是否允许选择视频'
  }),
  canSelectAudio: VariableItemTypeSchema.shape.canSelectAudio.meta({
    description: '该变量是否允许选择音频'
  }),
  canSelectCustomFileExtension: VariableItemTypeSchema.shape.canSelectCustomFileExtension.meta({
    description: '该变量是否允许选择自定义扩展名文件'
  }),
  customFileExtensionList: z.array(z.string()).optional().meta({
    description: '该变量允许选择的自定义文件扩展名列表'
  }),
  key: VariableItemTypeSchema.shape.key.meta({
    description: '变量键名，用于在提示词或工作流中引用该输入'
  }),
  label: VariableItemTypeSchema.shape.label.meta({
    description: '变量展示名称'
  }),
  valueType: VariableItemTypeSchema.shape.valueType.meta({
    description: '变量值的数据类型'
  }),
  required: VariableItemTypeSchema.shape.required.meta({
    description: '该变量是否必填'
  }),
  defaultValue: VariableItemTypeSchema.shape.defaultValue.meta({
    description: '变量默认值'
  }),
  referencePlaceholder: VariableItemTypeSchema.shape.referencePlaceholder.meta({
    description: '引用变量时展示的占位提示'
  }),
  isRichText: VariableItemTypeSchema.shape.isRichText.meta({
    description: '是否使用富文本编辑器输入'
  }),
  placeholder: VariableItemTypeSchema.shape.placeholder.meta({
    description: '变量输入框占位提示'
  }),
  maxLength: VariableItemTypeSchema.shape.maxLength.meta({
    description: '文本变量最大输入长度'
  }),
  minLength: VariableItemTypeSchema.shape.minLength.meta({
    description: '文本变量最小输入长度'
  }),
  list: z.array(OpenAPIVariableSelectOptionSchema).optional().meta({
    description: '选择类变量的可选项'
  }),
  markList: z.array(OpenAPIVariableMarkItemSchema).optional().meta({
    description: '数值滑块变量的刻度配置'
  }),
  step: VariableItemTypeSchema.shape.step.meta({
    description: '数值变量步进值'
  }),
  max: VariableItemTypeSchema.shape.max.meta({
    description: '数值变量最大值'
  }),
  min: VariableItemTypeSchema.shape.min.meta({
    description: '数值变量最小值'
  }),
  precision: VariableItemTypeSchema.shape.precision.meta({
    description: '数值变量小数精度'
  }),
  canLocalUpload: VariableItemTypeSchema.shape.canLocalUpload.meta({
    description: '该变量是否允许从本地上传文件'
  }),
  canUrlUpload: VariableItemTypeSchema.shape.canUrlUpload.meta({
    description: '该变量是否允许通过 URL 引入文件'
  }),
  timeGranularity: VariableItemTypeSchema.shape.timeGranularity.meta({
    description: '时间变量的选择粒度'
  }),
  timeRangeStart: VariableItemTypeSchema.shape.timeRangeStart.meta({
    description: '时间范围变量的起始时间'
  }),
  timeRangeEnd: VariableItemTypeSchema.shape.timeRangeEnd.meta({
    description: '时间范围变量的结束时间'
  }),
  datasetOptions: z.array(OpenAPIVariableDatasetOptionSchema).optional().meta({
    description: '知识库选择变量的可选知识库列表'
  }),
  customInputConfig: OpenAPIVariableCustomInputConfigSchema.optional().meta({
    description: '变量在编辑器中的自定义输入配置'
  }),
  enums: z.array(OpenAPIVariableEnumItemSchema).optional().meta({
    description: '已废弃：旧版枚举变量选项'
  }),
  type: VariableItemTypeSchema.shape.type.meta({
    description: '变量输入组件类型'
  }),
  description: VariableItemTypeSchema.shape.description.meta({
    description: '变量用途说明'
  })
}).meta({
  description: '应用对话变量配置项'
});

export const OpenAPIAppChatConfigSchema = AppChatConfigTypeSchema.extend({
  welcomeText: z.string().optional().meta({
    description: '新会话开始时展示给用户的欢迎语'
  }),
  variables: z.array(OpenAPIVariableItemSchema).optional().meta({
    description: '应用启动对话前需要用户填写的变量列表'
  }),
  autoExecute: OpenAPIAutoExecuteConfigSchema.optional().meta({
    description: '自动执行配置'
  }),
  questionGuide: OpenAPIQuestionGuideConfigSchema.optional().meta({
    description: '问题引导配置'
  }),
  ttsConfig: OpenAPIAppTTSConfigSchema.optional().meta({
    description: '语音播报配置'
  }),
  whisperConfig: OpenAPIAppWhisperConfigSchema.optional().meta({
    description: '语音输入配置'
  }),
  scheduledTriggerConfig: OpenAPIAppScheduledTriggerConfigSchema.optional().meta({
    description: '定时触发配置'
  }),
  chatInputGuide: OpenAPIChatInputGuideConfigSchema.optional().meta({
    description: '对话输入引导配置'
  }),
  fileSelectConfig: OpenAPIAppFileSelectConfigSchema.optional().meta({
    description: '对话文件选择配置'
  }),
  instruction: z.string().optional().meta({
    description: '应用对话页展示给用户的使用说明'
  })
}).meta({
  description: '应用对话运行配置，例如欢迎语、变量、语音和定时触发配置'
});

export const OpenAPIAppResourceRefsSchema = z
  .object({
    skillIds: z.array(z.string()).default([]).meta({
      description: '应用发布版本引用的技能 ID 列表'
    })
  })
  .optional()
  .meta({
    description: '应用发布后引用的外部资源集合'
  });

/* Create app */
export const CreateAppBodySchema = z
  .object({
    parentId: ParentIdSchema.optional().meta({
      example: '68ad85a7463006c963799a05',
      description: '父级应用/文件夹 ID'
    }),
    name: z.string().min(1).meta({
      example: '新应用',
      description: '应用名称'
    }),
    avatar: z.string().optional().meta({
      example: 'https://example.com/avatar.png',
      description: '应用头像'
    }),
    intro: z.string().optional().meta({
      example: '应用介绍',
      description: '应用介绍'
    }),
    type: z.enum(AppTypeEnum).meta({
      example: AppTypeEnum.workflow,
      description: '应用类型'
    }),
    modules: z.array(OpenAPIStoreNodeItemTypeSchema).optional().meta({
      example: [],
      description: '应用节点配置'
    }),
    edges: OpenAPIAppEdgesSchema.optional().meta({
      example: [],
      description: '应用连线'
    }),
    chatConfig: OpenAPIAppChatConfigSchema.optional().meta({
      description: '聊天配置'
    }),
    templateId: z.string().optional().meta({
      example: 'template-123',
      description: '模板 ID'
    }),
    utmParams: ShortUrlSchema.optional().meta({
      description: 'UTM 参数'
    })
  })
  .meta({
    example: {
      name: '新应用',
      type: AppTypeEnum.simple,
      modules: [],
      edges: [],
      parentId: '68ad85a7463006c963799a05'
    }
  });
export type CreateAppBodyType = z.infer<typeof CreateAppBodySchema>;

export const CreateAppResponseSchema = ObjectIdSchema.meta({
  example: '68ad85a7463006c963799a05',
  description: '应用 ID'
});
export type CreateAppResponseType = z.infer<typeof CreateAppResponseSchema>;

/* ============================================================================
 * API: 获取应用列表
 * Route: POST /api/core/app/list
 * Method: POST
 * Description: 获取当前团队下当前用户可读的应用或文件夹列表。
 * Tags: ['基础管理']
 * ============================================================================ */

export const ListAppBodySchema = z
  .object({
    parentId: ParentIdSchema.optional().meta({
      example: '68ad85a7463006c963799a05',
      description: '父级应用/文件夹 ID，为空时查询根目录'
    }),
    type: z
      .union([z.enum(AppTypeEnum), z.array(z.enum(AppTypeEnum))])
      .optional()
      .meta({
        example: AppTypeEnum.workflow,
        description: '应用类型筛选，支持单个类型或类型数组'
      }),
    searchKey: z.string().optional().meta({
      example: '客服',
      description: '应用名称或介绍搜索关键词'
    })
  })
  .meta({
    example: {
      parentId: '68ad85a7463006c963799a05',
      type: AppTypeEnum.workflow,
      searchKey: '客服'
    }
  });
export type ListAppBodyType = z.infer<typeof ListAppBodySchema>;

export const AppListItemSchema = z
  .object({
    _id: ObjectIdSchema.meta({ description: '应用 ID' }),
    parentId: ParentIdSchema.meta({ description: '父级应用/文件夹 ID' }),
    tmbId: ObjectIdSchema.meta({ description: '创建者团队成员 ID' }),
    name: z.string().meta({ example: '客服应用', description: '应用名称' }),
    avatar: z.string().meta({ description: '应用头像' }),
    intro: z.string().meta({ description: '应用介绍' }),
    type: z.enum(AppTypeEnum).meta({ example: AppTypeEnum.workflow, description: '应用类型' }),
    updateTime: z.coerce.date().meta({ description: '更新时间' }),
    pluginData: AppPluginDataSchema,
    permission: AppPermissionSchema,
    inheritPermission: z.boolean().optional().meta({ description: '是否继承父级权限' }),
    private: z.boolean().optional().meta({ description: '是否仅自己可见' }),
    sourceMember: SourceMemberSchema.meta({ description: '创建者信息' }),
    hasInteractiveNode: z.boolean().optional().meta({ description: '是否包含交互节点' })
  })
  .meta({
    description: '应用列表项'
  }) as z.ZodType<AppListItemType>;

export const ListAppResponseSchema = z.array(AppListItemSchema).meta({
  description: '应用列表'
});
export type ListAppResponseType = z.infer<typeof ListAppResponseSchema>;

/* ============================================================================
 * API: 获取应用详情
 * Route: GET /api/core/app/detail
 * Method: GET
 * Description: 获取应用完整详情。无写权限时会隐藏编排节点和边。
 * Tags: ['基础管理']
 * ============================================================================ */

export const GetAppDetailQuerySchema = z.object({
  appId: AppIdSchema
});
export type GetAppDetailQueryType = z.infer<typeof GetAppDetailQuerySchema>;

export const GetAppDetailResponseSchema = AppSchemaTypeSchema.extend({
  _id: AppIdSchema,
  parentId: ParentIdSchema.optional().meta({
    example: '68ad85a7463006c963799a05',
    description: '父级应用或文件夹 ID，根目录应用为空'
  }),
  teamId: ObjectIdSchema.meta({ description: '应用所属团队 ID' }),
  tmbId: ObjectIdSchema.meta({ description: '创建应用的团队成员 ID' }),
  type: z.enum(AppTypeEnum).meta({ example: AppTypeEnum.workflow, description: '应用类型' }),
  version: z.enum(['v1', 'v2']).optional().meta({
    example: 'v2',
    description: '应用编排版本，v2 表示当前工作流编排结构'
  }),
  name: z.string().meta({ example: '客服应用', description: '应用名称' }),
  avatar: z.string().meta({ description: '应用头像' }),
  intro: z.string().meta({ description: '应用介绍' }),
  templateId: z.string().optional().meta({
    example: 'template-simple-chat',
    description: '创建应用时使用的模板 ID'
  }),
  updateTime: z.coerce.date().meta({ description: '最后更新时间' }),
  modules: z
    .array(OpenAPIStoreNodeItemTypeSchema)
    .default([])
    .meta({ description: '应用节点配置' }),
  edges: OpenAPIAppEdgesSchema.default([]).meta({
    description: '应用连线'
  }),
  pluginData: AppPluginDataSchema,
  chatConfig: OpenAPIAppChatConfigSchema.default({}).meta({
    description: '应用对话运行配置'
  }),
  scheduledTriggerConfig: OpenAPIAppScheduledTriggerConfigSchema.optional().meta({
    description: '应用级定时触发配置；发布后由定时任务使用'
  }),
  scheduledTriggerNextTime: z.coerce.date().optional().meta({
    description: '下一次定时触发时间'
  }),
  resourceRefs: OpenAPIAppResourceRefsSchema.meta({
    description: '应用发布后引用的外部资源集合'
  }),
  inheritPermission: z.boolean().optional().meta({
    description: '是否继承父级文件夹权限'
  }),
  favourite: z.boolean().optional().meta({
    description: '当前用户是否收藏该应用'
  }),
  quick: z.boolean().optional().meta({
    description: '当前用户是否将该应用设为快捷入口'
  }),
  deleteTime: z.coerce.date().nullish().meta({
    description: '软删除时间；未删除时为空'
  }),
  defaultPermission: z.number().optional().meta({
    description: '已废弃：旧版默认权限值'
  }),
  inited: z.boolean().optional().meta({
    description: '已废弃：旧版初始化状态'
  }),
  teamTags: AppSchemaTypeSchema.shape.teamTags.meta({
    description: '已废弃：旧版团队标签'
  }),
  permission: AppPermissionSchema
}).meta({
  description: '应用详情'
}) as z.ZodType<AppDetailType>;
export type GetAppDetailResponseType = z.infer<typeof GetAppDetailResponseSchema>;

/* ============================================================================
 * API: 更新应用
 * Route: PUT /api/core/app/update
 * Method: PUT
 * Description: 更新应用基础信息、编排信息或移动应用位置。
 * Tags: ['基础管理']
 * ============================================================================ */

export const UpdateAppQuerySchema = z.object({
  appId: AppIdSchema
});
export type UpdateAppQueryType = z.infer<typeof UpdateAppQuerySchema>;

export const UpdateAppBodySchema = z
  .object({
    parentId: ParentIdSchema.optional().meta({
      example: '68ad85a7463006c963799a05',
      description: '新的父级应用/文件夹 ID；传入该字段表示移动应用'
    }),
    name: z.string().optional().meta({ example: '客服应用', description: '应用名称' }),
    type: z
      .enum(AppTypeEnum)
      .optional()
      .meta({ example: AppTypeEnum.workflow, description: '应用类型' }),
    avatar: z.string().optional().meta({ description: '应用头像' }),
    intro: z.string().optional().meta({ description: '应用介绍' }),
    nodes: z.array(OpenAPIStoreNodeItemTypeSchema).optional().meta({ description: '应用节点配置' }),
    edges: OpenAPIAppEdgesSchema.optional().meta({ description: '应用连线' }),
    chatConfig: OpenAPIAppChatConfigSchema.optional().meta({ description: '聊天配置' }),
    teamTags: AppSchemaTypeSchema.shape.teamTags.optional().meta({ description: '团队标签' })
  })
  .meta({
    example: {
      name: '客服应用',
      intro: '新的应用介绍'
    }
  });
export type UpdateAppBodyType = z.infer<typeof UpdateAppBodySchema>;

export const UpdateAppResponseSchema = z.unknown().nullable().optional().meta({
  description: 'MongoDB 更新结果；移动应用时无返回数据'
});
export type UpdateAppResponseType = z.infer<typeof UpdateAppResponseSchema>;

/* ============================================================================
 * API: 删除应用
 * Route: DELETE /api/core/app/del
 * Method: DELETE
 * Description: 删除应用或文件夹，并返回被删除的非文件夹应用 ID 列表。
 * Tags: ['基础管理']
 * ============================================================================ */

export const DeleteAppQuerySchema = z.object({
  appId: AppIdSchema
});
export type DeleteAppQueryType = z.infer<typeof DeleteAppQuerySchema>;

export const DeleteAppResponseSchema = z.array(ObjectIdSchema).meta({
  description: '被删除的非文件夹应用 ID 列表'
});
export type DeleteAppResponseType = z.infer<typeof DeleteAppResponseSchema>;

/* ============================================================================
 * API: 复制应用
 * Route: POST /api/core/app/copy
 * Method: POST
 * Description: 复制指定应用并返回新应用 ID。
 * Tags: ['基础管理']
 * ============================================================================ */

export const CopyAppBodySchema = z.object({
  appId: AppIdSchema
});
export type CopyAppBodyType = z.infer<typeof CopyAppBodySchema>;

export const CopyAppResponseSchema = z.object({
  appId: ObjectIdSchema.meta({ description: '新应用 ID' })
});
export type CopyAppResponseType = z.infer<typeof CopyAppResponseSchema>;

/* ============================================================================
 * API: 批量获取应用基础信息
 * Route: POST /api/core/app/getBasicInfo
 * Method: POST
 * Description: 根据应用 ID 列表批量获取应用名称和头像。
 * Tags: ['基础管理']
 * ============================================================================ */

export const GetAppBasicInfoBodySchema = z.object({
  ids: z.array(ObjectIdSchema).meta({
    example: ['68ad85a7463006c963799a05'],
    description: '应用 ID 列表'
  })
});
export type GetAppBasicInfoBodyType = z.infer<typeof GetAppBasicInfoBodySchema>;

export const AppBasicInfoSchema = z.object({
  id: ObjectIdSchema.meta({ description: '应用 ID' }),
  name: z.string().meta({ description: '应用名称' }),
  avatar: z.string().meta({ description: '应用头像' })
});
export const GetAppBasicInfoResponseSchema = z.array(AppBasicInfoSchema).meta({
  description: '应用基础信息列表'
});
export type GetAppBasicInfoResponseType = z.infer<typeof GetAppBasicInfoResponseSchema>;

/* ============================================================================
 * API: 转换为工作流应用
 * Route: POST /api/core/app/transitionWorkflow
 * Method: POST
 * Description: 将简易应用转换为工作流应用，可选择复制为新应用。
 * Tags: ['基础管理']
 * ============================================================================ */

export const TransitionWorkflowBodySchema = z.object({
  appId: AppIdSchema,
  createNew: z.boolean().optional().meta({
    example: true,
    description: '是否复制为新的工作流应用'
  })
});
export type TransitionWorkflowBodyType = z.infer<typeof TransitionWorkflowBodySchema>;

export const TransitionWorkflowResponseSchema = z.object({
  id: ObjectIdSchema.optional().meta({ description: '新应用 ID；原地转换时为空' })
});
export type TransitionWorkflowResponseType = z.infer<typeof TransitionWorkflowResponseSchema>;

export const EmptyAppOperationResponseSchema = EmptyObjectResponseSchema;
