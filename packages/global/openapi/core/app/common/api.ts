import { ObjectIdSchema } from '../../../../common/type/mongo';
import { ParentIdSchema } from '../../../../common/parentFolder/type';
import { AppTypeEnum } from '../../../../core/app/constants';
import {
  AppChatConfigTypeSchema,
  AppResourceRefsSchema,
  AppScheduledTriggerConfigTypeSchema,
  VariableItemTypeSchema,
  AppSchemaTypeSchema,
  type AppDetailType,
  type AppListItemType
} from '../../../../core/app/type';
import { ShortUrlSchema } from '../../../../support/marketing/type';
import { AppPermissionSchema } from '../../../../support/permission/app/controller.schema';
import { SourceMemberSchema } from '../../../../support/user/type';
import { OpenAPIStoreNodeItemTypeSchema } from '../../workflow/node';
import { BoolSchema, NumSchema } from '../../../../common/zod';
import z from 'zod';

const AppIdSchema = ObjectIdSchema.meta({
  example: '68ad85a7463006c963799a05',
  description: '应用 ID'
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

const appTypeValues = new Set(Object.values(AppTypeEnum));

const preprocessListAppType = (value: unknown) => {
  const isAppType = (item: unknown): item is AppTypeEnum =>
    typeof item === 'string' && appTypeValues.has(item as AppTypeEnum);

  if (value === '') {
    return undefined;
  }

  if (Array.isArray(value)) {
    const validTypes = value.filter(isAppType);
    return validTypes.length > 0 ? validTypes : undefined;
  }

  return isAppType(value) ? value : undefined;
};

export const OpenAPIAppScheduledTriggerConfigSchema = z
  .preprocess(emptyObjectToUndefined, AppScheduledTriggerConfigTypeSchema.optional())
  .meta({
    description: '应用定时触发配置'
  });

const OpenAPIVariableItemSchema = VariableItemTypeSchema.meta({
  description: '应用对话变量配置项'
});

export const OpenAPIAppChatConfigSchema = AppChatConfigTypeSchema.extend({
  variables: z.array(OpenAPIVariableItemSchema).optional().meta({
    description: '应用启动对话前需要用户填写的变量列表'
  }),
  scheduledTriggerConfig: OpenAPIAppScheduledTriggerConfigSchema.optional().meta({
    description: '定时触发配置'
  })
}).meta({
  description: '应用对话运行配置，例如欢迎语、变量、语音和定时触发配置'
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
    edges: AppSchemaTypeSchema.shape.edges.optional().meta({
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
      .preprocess(
        preprocessListAppType,
        z.union([z.enum(AppTypeEnum), z.array(z.enum(AppTypeEnum))]).optional()
      )
      .optional()
      .meta({
        example: AppTypeEnum.workflow,
        description: '应用类型筛选，支持单个类型或类型数组；空字符串按全部类型处理'
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
    pluginData: AppSchemaTypeSchema.shape.pluginData,
    permission: AppPermissionSchema,
    inheritPermission: BoolSchema.optional().meta({ description: '是否继承父级权限' }),
    private: BoolSchema.optional().meta({ description: '是否仅自己可见' }),
    sourceMember: SourceMemberSchema.meta({ description: '创建者信息' }),
    hasInteractiveNode: BoolSchema.optional().meta({ description: '是否包含交互节点' })
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
  edges: AppSchemaTypeSchema.shape.edges.default([]).meta({
    description: '应用连线'
  }),
  pluginData: AppSchemaTypeSchema.shape.pluginData,
  chatConfig: OpenAPIAppChatConfigSchema.default({}).meta({
    description: '应用对话运行配置'
  }),
  scheduledTriggerConfig: OpenAPIAppScheduledTriggerConfigSchema.optional().meta({
    description: '应用级定时触发配置；发布后由定时任务使用'
  }),
  scheduledTriggerNextTime: z.coerce.date().optional().meta({
    description: '下一次定时触发时间'
  }),
  resourceRefs: AppResourceRefsSchema.optional().meta({
    description: '应用发布后引用的外部资源集合'
  }),
  inheritPermission: BoolSchema.optional().meta({
    description: '是否继承父级文件夹权限'
  }),
  favourite: BoolSchema.optional().meta({
    description: '当前用户是否收藏该应用'
  }),
  quick: BoolSchema.optional().meta({
    description: '当前用户是否将该应用设为快捷入口'
  }),
  deleteTime: z.coerce.date().nullish().meta({
    description: '软删除时间；未删除时为空'
  }),
  defaultPermission: NumSchema.optional().meta({
    description: '旧版默认权限值',
    deprecated: true
  }),
  inited: BoolSchema.optional().meta({
    description: '旧版初始化状态',
    deprecated: true
  }),
  teamTags: AppSchemaTypeSchema.shape.teamTags.meta({
    description: '旧版团队标签',
    deprecated: true
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
    edges: AppSchemaTypeSchema.shape.edges.optional().meta({ description: '应用连线' }),
    chatConfig: OpenAPIAppChatConfigSchema.optional().meta({ description: '聊天配置' }),
    teamTags: AppSchemaTypeSchema.shape.teamTags.optional().meta({
      description: '旧版团队标签',
      deprecated: true
    })
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
  createNew: BoolSchema.optional().meta({
    example: true,
    description: '是否复制为新的工作流应用'
  })
});
export type TransitionWorkflowBodyType = z.infer<typeof TransitionWorkflowBodySchema>;

export const TransitionWorkflowResponseSchema = z
  .object({
    id: ObjectIdSchema.meta({ description: '复制生成的新应用 ID' })
  })
  .optional()
  .meta({
    description: '复制为新应用时返回新应用 ID；原地转换无返回数据'
  });
export type TransitionWorkflowResponseType = z.infer<typeof TransitionWorkflowResponseSchema>;
