import z from 'zod';
import { VersionListItemSchema } from '../../../../core/app/version/type';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { PaginationSchema } from '../../../api';
import { OpenAPIStoreNodeItemTypeSchema } from '../../workflow/node';
import { AppResourceRefsSchema, AppSchemaTypeSchema } from '../../../../core/app/type';
import { OpenAPIAppChatConfigSchema } from '../common/api';
import { BoolSchema, NumSchema } from '../../../../common/zod';

export const PublishAppQuerySchema = z.object({
  appId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '应用 ID'
  })
});
export type PublishAppQueryType = z.infer<typeof PublishAppQuerySchema>;

const AppVersionNodesSchema = z.array(OpenAPIStoreNodeItemTypeSchema).meta({
  description: '版本内保存的应用节点配置'
});

const AppVersionEdgesSchema = AppSchemaTypeSchema.shape.edges.default([]).meta({
  description: '版本内保存的应用连线配置'
});

const AppVersionChatConfigSchema = OpenAPIAppChatConfigSchema.default({}).meta({
  description: '版本内保存的应用对话配置'
});

const AppVersionResourceRefsSchema = AppResourceRefsSchema.optional().meta({
  description: '该版本引用的外部资源集合'
});

const OpenAPIVersionListItemSchema = VersionListItemSchema.extend({
  _id: ObjectIdSchema.meta({
    description: '版本记录 ID'
  }),
  appId: ObjectIdSchema.meta({
    description: '版本所属应用 ID'
  }),
  versionName: z.string().meta({
    example: '正式发布版',
    description: '版本名称'
  }),
  time: z.coerce.date().meta({
    description: '版本创建时间'
  }),
  isPublish: BoolSchema.optional().meta({
    description: '是否为已发布版本'
  }),
  tmbId: ObjectIdSchema.meta({
    description: '创建或更新该版本的团队成员 ID'
  }),
  sourceMember: VersionListItemSchema.shape.sourceMember.meta({
    description: '创建或更新该版本的成员信息'
  })
}).meta({
  description: '应用版本列表项'
});

export const PublishAppBodySchema = z.object({
  nodes: AppVersionNodesSchema.optional().meta({
    description: '本次保存的应用节点配置；未传时按空节点保存'
  }),
  edges: AppVersionEdgesSchema.optional().meta({
    description: '本次保存的应用连线配置；未传时按空连线保存'
  }),
  chatConfig: AppVersionChatConfigSchema.optional().meta({
    description: '本次保存的应用对话配置'
  }),
  isPublish: BoolSchema.optional().meta({
    example: true,
    description: '是否将该版本发布为线上运行版本'
  }),
  versionName: z.string().optional().meta({
    example: '正式发布版',
    description: '版本名称；自动保存时服务端会使用自动保存文案'
  }),
  autoSave: BoolSchema.optional().meta({
    example: false,
    description: '是否为编辑器自动保存；自动保存会覆盖当前自动保存记录'
  })
});
export type PublishAppBodyType = z.infer<typeof PublishAppBodySchema>;

/* ============================================================================
 * API: 发布或保存应用版本
 * Route: POST /api/core/app/version/publish
 * Method: POST
 * Description: 保存应用版本，支持自动保存、普通保存和发布。
 * Tags: ['版本管理']
 * ============================================================================ */

export const PublishAppResponseSchema = z.undefined().meta({
  description: '保存成功'
});
export type PublishAppResponseType = z.infer<typeof PublishAppResponseSchema>;

/* ============================================================================
 * API: 获取应用版本列表
 * Route: POST /api/core/app/version/list
 * Method: POST
 * Description: 分页获取指定应用的版本列表。
 * Tags: ['版本管理']
 * ============================================================================ */

export const AppVersionListBodySchema = PaginationSchema.extend({
  appId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '应用 ID'
  }),
  isPublish: BoolSchema.optional().meta({
    example: true,
    description: '是否只查询发布版本'
  })
});
export type AppVersionListBodyType = z.infer<typeof AppVersionListBodySchema>;

export const AppVersionListResponseSchema = z.object({
  total: NumSchema.optional().default(0).meta({
    example: 100,
    description: '版本总数'
  }),
  list: z.array(OpenAPIVersionListItemSchema).optional().default([]).meta({
    description: '版本列表'
  })
});
export type AppVersionListResponseType = z.infer<typeof AppVersionListResponseSchema>;

/* ============================================================================
 * API: 获取应用版本详情
 * Route: GET /api/core/app/version/detail
 * Method: GET
 * Description: 获取指定应用版本的完整编排详情。
 * Tags: ['版本管理']
 * ============================================================================ */

export const GetAppVersionDetailQuerySchema = z.object({
  versionId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '版本 ID'
  }),
  appId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a06',
    description: '应用 ID'
  })
});
export type GetAppVersionDetailQueryType = z.infer<typeof GetAppVersionDetailQuerySchema>;

export const GetAppVersionDetailResponseSchema = z.object({
  _id: ObjectIdSchema.meta({
    description: '版本记录 ID'
  }),
  tmbId: ObjectIdSchema.meta({
    description: '创建或更新该版本的团队成员 ID'
  }),
  appId: ObjectIdSchema.meta({
    description: '版本所属应用 ID'
  }),
  time: z.coerce.date().meta({
    description: '版本创建时间'
  }),
  nodes: AppVersionNodesSchema.default([]).meta({
    description: '版本内保存的应用节点配置'
  }),
  edges: AppVersionEdgesSchema,
  chatConfig: AppVersionChatConfigSchema,
  isPublish: BoolSchema.optional().meta({
    description: '是否为已发布版本'
  }),
  isAutoSave: BoolSchema.optional().meta({
    description: '是否为编辑器自动保存版本'
  }),
  versionName: z.string().meta({
    example: '正式发布版',
    description: '版本名称'
  }),
  resourceRefs: AppVersionResourceRefsSchema
});
export type GetAppVersionDetailResponseType = z.infer<typeof GetAppVersionDetailResponseSchema>;

/* ============================================================================
 * API: 获取应用最新版本
 * Route: GET /api/core/app/version/latest
 * Method: GET
 * Description: 获取应用最新版本的节点、连线和聊天配置。
 * Tags: ['版本管理']
 * ============================================================================ */

export const GetLatestAppVersionQuerySchema = z.object({
  appId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '应用 ID'
  })
});
export type GetLatestAppVersionQueryType = z.infer<typeof GetLatestAppVersionQuerySchema>;

export const GetLatestAppVersionBodySchema = z.object({}).meta({
  description: '获取最新版本不需要请求体'
});
export type GetLatestAppVersionBodyType = z.infer<typeof GetLatestAppVersionBodySchema>;

export const GetLatestAppVersionResponseSchema = z.object({
  versionId: z.string().optional().meta({
    description: '当前线上版本 ID；未发布过版本时可能为空'
  }),
  versionName: z.string().optional().meta({
    description: '当前线上版本名称；未发布过版本时通常为应用名称'
  }),
  nodes: AppVersionNodesSchema.default([]).meta({
    description: '版本内保存的应用节点配置'
  }),
  edges: AppVersionEdgesSchema,
  chatConfig: AppVersionChatConfigSchema
});
export type GetLatestAppVersionResponseType = z.infer<typeof GetLatestAppVersionResponseSchema>;

/* ============================================================================
 * API: 更新应用版本名称
 * Route: PUT /api/core/app/version/update
 * Method: PUT
 * Description: 更新指定应用版本的版本名称。
 * Tags: ['版本管理']
 * ============================================================================ */

export const UpdateAppVersionBodySchema = z.object({
  appId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '应用 ID'
  }),
  versionId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a06',
    description: '版本 ID'
  }),
  versionName: z.string().trim().min(1).meta({
    example: '正式发布版',
    description: '版本名称'
  })
});
export type UpdateAppVersionBodyType = z.infer<typeof UpdateAppVersionBodySchema>;

export const UpdateAppVersionResponseSchema = z.undefined().meta({
  description: '更新成功'
});
export type UpdateAppVersionResponseType = z.infer<typeof UpdateAppVersionResponseSchema>;
