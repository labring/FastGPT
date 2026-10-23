import { z } from 'zod';
import { DatasetSearchModeEnum, DatasetTypeEnum } from '../../../core/dataset/constants';
import { ApiDatasetServerSchema } from '../../../core/dataset/apiDataset/type';
import { ObjectIdSchema } from '../../../common/type/mongo';
import { FolderAccessModeSchema, ParentIdSchema } from '../../../common/parentFolder/type';
import { BoolSchema } from '../../../common/zod';
import {
  ChunkSettingsSchema,
  DatasetItemSchema,
  DatasetSchema,
  DatasetListItemSchema,
  sangforFileParseConfigSchema,
  InheritPermissionInputSchema,
  SearchDataResponseItemSchema,
  type WithOptionalInheritPermission
} from '../../../core/dataset/type';
import { AppListSortSchema } from '../../../core/app/constants';
import {
  CollaboratorListSchema,
  CollaboratorUpdateListSchema,
  ShowUsernameQuerySchema
} from '../../../support/permission/collaborator.schema';
import {
  createPaginationSchema,
  PaginationPageSizeLimit,
  PaginationResponseSchema
} from '../../api';

/* ============================================================================
 * API: 创建知识库
 * Route: POST /api/core/dataset/create
 * ============================================================================ */

// 入参 Schema
export const CreateDatasetBodySchema = z.object({
  parentId: ParentIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '父级文件夹 ID,不传则创建在根目录'
  }),
  type: z.enum(DatasetTypeEnum).meta({
    example: DatasetTypeEnum.dataset,
    description: '知识库类型'
  }),
  name: z.string().meta({
    example: '我的知识库',
    description: '知识库名称'
  }),
  intro: z.string().meta({
    example: '这是一个用于存储产品文档的知识库',
    description: '知识库简介'
  }),
  avatar: z.string().optional().meta({
    example: '/imgs/dataset/avatar.png',
    description: '知识库头像，可不传，返回时使用默认图标'
  }),
  vectorModelId: z.string().optional().meta({
    description: '向量模型 ID，不传则使用默认向量模型'
  }),
  vectorModel: z.string().optional().meta({
    example: 'text-embedding-3-small',
    description: '向量模型标识，不传则使用默认向量模型',
    deprecated: true
  }),
  agentModelId: z.string().optional().meta({
    description: '知识库 Agent 模型 ID，不传则使用默认模型'
  }),
  agentModel: z.string().optional().meta({
    example: 'gpt-4o-mini',
    description: '知识库 Agent 模型标识，不传则使用默认模型',
    deprecated: true
  }),
  vlmModelId: z.string().nullable().optional().meta({
    description: '视觉语言模型 ID；未传沿用默认，null 或空字符串表示不设置',
    example: ''
  }),
  vlmModel: z.string().optional().meta({
    example: 'gpt-4o',
    description: '视觉语言模型标识',
    deprecated: true
  }),
  apiDatasetServer: ApiDatasetServerSchema.optional().meta({
    description: '第三方知识库服务器配置(API/飞书/语雀/钉钉)'
  }),
  sangforFileParseConfig: sangforFileParseConfigSchema.optional().meta({
    description: '外部文档解析开关(页眉页脚/附录/图片识别/图转表),仅对 customPdfParse 解析路径生效'
  }),
  inheritPermission: InheritPermissionInputSchema
});

export type CreateDatasetBody = WithOptionalInheritPermission<
  z.infer<typeof CreateDatasetBodySchema>
>;

// 出参 Schema
export const CreateDatasetResponseSchema = ObjectIdSchema.meta({
  example: '68ad85a7463006c963799a05',
  description: '新创建的知识库 ID'
});

export type CreateDatasetResponse = z.infer<typeof CreateDatasetResponseSchema>;

/* ============================================================================
 * API: 创建知识库并上传文件
 * Route: POST /api/core/dataset/createWithFiles
 * ============================================================================ */

// 入参 Schema
export const CreateDatasetWithFilesBodySchema = z.object({
  datasetParams: z
    .object({
      name: z.string().meta({
        example: '我的知识库',
        description: '知识库名称'
      }),
      avatar: z.string().optional().meta({
        example: '/imgs/dataset/avatar.png',
        description: '知识库头像，可不传，返回时使用默认图标'
      }),
      parentId: ParentIdSchema.meta({
        example: '68ad85a7463006c963799a05',
        description: '父级文件夹 ID'
      }),
      vectorModelId: z.string().optional().meta({ description: '向量模型 ID' }),
      agentModelId: z.string().optional().meta({ description: 'Agent 模型 ID' }),
      vlmModelId: z.string().nullable().optional().meta({
        description: '视觉语言模型 ID；未传沿用默认，null 或空字符串表示不设置',
        example: ''
      }),
      sangforFileParseConfig: sangforFileParseConfigSchema.optional().meta({
        description:
          '外部文档解析开关(页眉页脚/附录/图片识别/图转表),仅对 customPdfParse 解析路径生效'
      })
    })
    .meta({ description: '知识库参数' }),
  files: z
    .array(
      z.object({
        fileId: z.string().meta({
          example: 'temp/abc123.pdf',
          description: '临时文件 ID,必须以 temp/ 开头'
        }),
        name: z.string().meta({
          example: '产品文档.pdf',
          description: '文件名称'
        })
      })
    )
    .meta({ description: '待上传的文件列表' })
});

export type CreateDatasetWithFilesBody = z.infer<typeof CreateDatasetWithFilesBodySchema>;

// 出参 Schema
export const CreateDatasetWithFilesResponseSchema = z.object({
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '新创建的知识库 ID'
  }),
  name: z.string().meta({
    example: '我的知识库',
    description: '知识库名称'
  }),
  avatar: DatasetSchema.shape.avatar.meta({
    example: '/imgs/dataset/avatar.png',
    description: '知识库头像'
  }),
  vectorModel: z
    .object({
      model: z.string().meta({
        example: 'text-embedding-3-small',
        description: '向量模型名称'
      })
    })
    .meta({
      description: '向量模型选择信息'
    })
});

export type CreateDatasetWithFilesResponse = z.infer<typeof CreateDatasetWithFilesResponseSchema>;

/* ============================================================================
 * API: 删除知识库
 * Route: DELETE /api/core/dataset/delete
 * ============================================================================ */
export const DeleteDatasetQuerySchema = z.object({
  id: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  })
});
export type DeleteDatasetQuery = z.infer<typeof DeleteDatasetQuerySchema>;

/* ============================================================================
 * API: 获取知识库详情
 * Route: GET /api/core/dataset/detail
 * ============================================================================ */
export const GetDatasetDetailQuerySchema = z.object({
  id: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  })
});
export type GetDatasetDetailQuery = z.infer<typeof GetDatasetDetailQuerySchema>;

// 出参复用 DatasetItemSchema
export const GetDatasetDetailResponseSchema = DatasetItemSchema;
export type GetDatasetDetailResponse = z.infer<typeof GetDatasetDetailResponseSchema>;

/* ============================================================================
 * API: 获取知识库列表
 * Route: POST /api/core/dataset/list
 * Description: 已弃用，使用 POST /api/core/dataset/listV2；旧接口保留数组响应兼容。
 * ============================================================================ */
export const GetDatasetListBodySchema = z
  .object({
    parentId: ParentIdSchema.meta({
      example: '68ad85a7463006c963799a05',
      description: '父级文件夹 ID,null 或不传表示根目录'
    }),
    type: z
      .union([z.enum(DatasetTypeEnum), z.array(z.enum(DatasetTypeEnum))])
      .optional()
      .meta({
        example: DatasetTypeEnum.dataset,
        description: '知识库类型筛选'
      }),
    searchKey: z.string().optional().meta({
      example: '产品文档',
      description: '搜索关键词,按名称和简介模糊匹配'
    }),
    sort: AppListSortSchema.optional(),
    tmbIds: z.array(ObjectIdSchema).optional().meta({
      description: '按创建者筛选；空数组返回空列表'
    })
  })
  .meta({
    example: {
      parentId: null,
      type: DatasetTypeEnum.dataset,
      searchKey: '产品文档'
    }
  });
export type GetDatasetListBody = z.infer<typeof GetDatasetListBodySchema>;

/* ============================================================================
 * API: 获取知识库列表 V2
 * Route: POST /api/core/dataset/listV2
 * Method: POST
 * Description: 分页或按 ID 列表获取当前用户有权限访问的知识库，优先按 ID 查询并过滤目录和分页字段。
 * Tags: ['Dataset', 'Read']
 * ============================================================================ */
const GetDatasetListV2FiltersSchema = GetDatasetListBodySchema.omit({ parentId: true }).extend({
  withAppCount: BoolSchema.optional().meta({
    example: true,
    description: '是否返回被正式应用引用的数量；默认不统计，仅非文件夹资源的 Owner 可查看'
  }),
  withFileCount: BoolSchema.optional().meta({
    example: true,
    description:
      '是否计算并返回知识库文件总数，默认不计算；统计所有层级的非目录集合，不按文件权限过滤'
  })
});

// ID 分支优先匹配，由 Zod 过滤目录和分页字段；分页分支拒绝已有但无效的 ID，避免意外扩大查询范围。
export const GetDatasetListV2BodySchema = z.union([
  z
    .object({
      datasetIds: z
        .array(ObjectIdSchema)
        .min(1)
        .max(PaginationPageSizeLimit)
        .meta({
          example: ['68ad85a7463006c963799a05'],
          description: `按知识库或文件夹 ID 精确查询，最多 ${PaginationPageSizeLimit} 个；优先匹配该分支，解析时过滤 parentId 和分页参数，保留公共筛选字段`
        }),
      ...GetDatasetListV2FiltersSchema.shape
    })
    .meta({ title: '按 IDs 获取' }),
  createPaginationSchema({
    ...GetDatasetListV2FiltersSchema.shape,
    parentId: GetDatasetListBodySchema.shape.parentId.meta({
      example: null,
      description:
        '父级文件夹 ID；null 或空字符串表示根目录；搜索时限定在指定目录及其子树，不传则搜索全部可读知识库'
    }),
    datasetIds: z.never().optional()
  }).meta({ title: '分页获取' })
]);
export type GetDatasetListV2Body = z.infer<typeof GetDatasetListV2BodySchema>;

// 出参复用 DatasetListItemSchema
export const GetDatasetListResponseSchema = z.array(DatasetListItemSchema);
export type GetDatasetListResponse = z.infer<typeof GetDatasetListResponseSchema>;

export const GetDatasetListV2ResponseSchema = PaginationResponseSchema(DatasetListItemSchema);
export type GetDatasetListV2Response = z.infer<typeof GetDatasetListV2ResponseSchema>;

/* ============================================================================
 * API: 获取知识库路径
 * Route: GET /api/core/dataset/paths
 * ============================================================================ */
export const GetDatasetPathsQuerySchema = z.object({
  sourceId: z.string().optional().meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  }),
  type: z.enum(['current', 'parent']).meta({
    example: 'current',
    description: 'current: 包含自身路径; parent: 仅返回父级路径'
  })
});
export type GetDatasetPathsQuery = z.infer<typeof GetDatasetPathsQuerySchema>;

export const DatasetPathItemSchema = z.object({
  parentId: ParentIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '节点 ID'
  }),
  parentName: z.string().meta({
    example: '产品文档',
    description: '节点名称'
  }),
  folderAccessMode: FolderAccessModeSchema.optional().meta({
    description: '当前目录权限模式；navigate 表示仅可通过可读后代浏览'
  })
});
export const GetDatasetPathsResponseSchema = z.array(DatasetPathItemSchema);
export type GetDatasetPathsResponse = z.infer<typeof GetDatasetPathsResponseSchema>;

/* ============================================================================
 * API: 转让知识库所有权
 * Route: POST /api/proApi/core/dataset/changeOwner
 * Method: POST
 * Description: 将知识库所有权转让给指定团队成员。
 * Tags: ['资源权限', '知识库权限管理']
 * ============================================================================ */

export const ChangeDatasetOwnerBodySchema = z
  .object({
    datasetId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a05',
      description: '知识库 ID'
    }),
    ownerId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a06',
      description: '新的所有者团队成员 ID'
    })
  })
  .meta({
    example: {
      datasetId: '68ad85a7463006c963799a05',
      ownerId: '68ad85a7463006c963799a06'
    }
  });
export type ChangeDatasetOwnerBody = z.infer<typeof ChangeDatasetOwnerBodySchema>;

export const ChangeDatasetOwnerResponseSchema = z.undefined().meta({ description: '转让成功' });
export type ChangeDatasetOwnerResponse = z.infer<typeof ChangeDatasetOwnerResponseSchema>;

/* ============================================================================
 * API: 获取知识库协作者列表
 * Route: GET /api/proApi/core/dataset/collaborator/list
 * Method: GET
 * Description: 获取知识库协作者列表，包含继承权限场景下的父级协作者信息。
 * Tags: ['协作者管理', '知识库权限管理']
 * ============================================================================ */

export const GetDatasetCollaboratorListQuerySchema = z.object({
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  }),
  showUsername: ShowUsernameQuerySchema
});
export type GetDatasetCollaboratorListQuery = z.infer<typeof GetDatasetCollaboratorListQuerySchema>;

export const GetDatasetCollaboratorListResponseSchema = CollaboratorListSchema;
export type GetDatasetCollaboratorListResponse = z.infer<
  typeof GetDatasetCollaboratorListResponseSchema
>;

/* ============================================================================
 * API: 更新知识库协作者
 * Route: POST /api/proApi/core/dataset/collaborator/update
 * Method: POST
 * Description: 覆盖更新知识库或知识库文件夹的协作者权限；继承权限场景会按资源类型处理继承关系。
 * Tags: ['协作者管理', '知识库权限管理']
 * ============================================================================ */

export const UpdateDatasetCollaboratorBodySchema = z
  .object({
    datasetId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a05',
      description: '知识库 ID'
    }),
    collaborators: CollaboratorUpdateListSchema.meta({
      description: '更新后的协作者权限列表，至少包含一个协作者且目标不可重复'
    })
  })
  .meta({
    example: {
      datasetId: '68ad85a7463006c963799a05',
      collaborators: [
        {
          tmbId: '68ad85a7463006c963799a06',
          permission: 4
        }
      ]
    }
  });
export type UpdateDatasetCollaboratorBody = z.infer<typeof UpdateDatasetCollaboratorBodySchema>;

export const UpdateDatasetCollaboratorResponseSchema = z.undefined().meta({
  description: '操作成功'
});
export type UpdateDatasetCollaboratorResponse = z.infer<
  typeof UpdateDatasetCollaboratorResponseSchema
>;

/* ============================================================================
 * API: 同步知识库数据
 * Route: POST /api/proApi/core/dataset/datasetSync
 * Method: POST
 * Description: 检查知识库同步状态、训练状态、权限和索引额度后，触发知识库同步任务。
 * Tags: ['知识库管理', 'Write']
 * ============================================================================ */
export const PostDatasetSyncBodySchema = z
  .object({
    datasetId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a05',
      description: '需要同步的知识库 ID'
    })
  })
  .meta({
    example: {
      datasetId: '68ad85a7463006c963799a05'
    }
  });
export type PostDatasetSyncParams = z.infer<typeof PostDatasetSyncBodySchema>;

/* ============================================================================
 * API: 更新知识库
 * Route: PUT /api/core/dataset/update
 * ============================================================================ */
export const UpdateDatasetBodySchema = z.object({
  id: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  }),
  parentId: ParentIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '父级文件夹 ID,传 null 表示移动到根目录'
  }),
  name: z.string().optional().meta({
    example: '我的知识库',
    description: '知识库名称'
  }),
  avatar: z.string().optional().meta({
    example: '/imgs/dataset/avatar.png',
    description: '知识库头像'
  }),
  intro: z.string().optional().meta({
    example: '这是一个用于存储产品文档的知识库',
    description: '知识库简介'
  }),
  agentModelId: z.string().trim().min(1, '文本理解模型不可清空').optional().meta({
    description: '知识库 Agent 模型 ID；未传不修改，不允许清空'
  }),
  agentModel: z.string().trim().min(1, '文本理解模型不可清空').optional().meta({
    description: '旧版知识库 Agent 模型标识，仅未传 agentModelId 时使用',
    deprecated: true
  }),
  vlmModelId: z.string().trim().nullable().optional().meta({
    description: '视觉语言模型 ID；未传不修改，null 或空字符串表示清空',
    example: null
  }),
  vlmModel: z.string().trim().nullable().optional().meta({
    description: '旧版视觉语言模型标识，仅未传 vlmModelId 时使用；null 或空字符串表示清空',
    deprecated: true
  }),
  websiteConfig: z
    .object({
      url: z.string().meta({ description: '网站 URL' }),
      selector: z.string().meta({ description: '网站选择器' })
    })
    .optional()
    .meta({
      description: '网站知识库配置'
    }),
  externalReadUrl: z.string().optional().meta({
    description: '外部读取 URL'
  }),
  apiDatasetServer: ApiDatasetServerSchema.optional().meta({
    description: '第三方知识库服务器配置(API/飞书/语雀/钉钉)'
  }),
  autoSync: z.boolean().optional().meta({
    description: '是否自动同步'
  }),
  chunkSettings: ChunkSettingsSchema.optional().meta({
    description: '分块配置'
  }),
  sangforFileParseConfig: sangforFileParseConfigSchema.optional().meta({
    description:
      '外部文档解析开关(页眉页脚/附录/图片识别/图转表),仅对 customPdfParse 解析路径生效;编辑后仅对新解析的文件生效'
  })
});
export type UpdateDatasetBody = z.infer<typeof UpdateDatasetBodySchema>;

/* ============================================================================
 * API: 恢复知识库继承权限
 * Route: PUT /api/core/dataset/resumeInheritPermission
 * ============================================================================ */
export const ResumeDatasetInheritPermissionBodySchema = z.object({
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  })
});
export type ResumeDatasetInheritPermissionBody = z.infer<
  typeof ResumeDatasetInheritPermissionBodySchema
>;

/** 启用 collection 级权限：物化该 dataset 全部 collection 快照后置位开关。 */
export const EnableCollectionPermissionBodySchema = z.object({
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  })
});
export type EnableCollectionPermissionBody = z.infer<typeof EnableCollectionPermissionBodySchema>;

export const EnableCollectionPermissionResponseSchema = z.object({
  collectionCount: z.number().meta({
    description: '已物化的 collection 数量'
  })
});
export type EnableCollectionPermissionResponse = z.infer<
  typeof EnableCollectionPermissionResponseSchema
>;

/** 关闭 collection 级权限：清理该 dataset 全部 collection 权限配置后置位开关。 */
export const DisableCollectionPermissionBodySchema = z.object({
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  })
});
export type DisableCollectionPermissionBody = z.infer<typeof DisableCollectionPermissionBodySchema>;

export const DisableCollectionPermissionResponseSchema = z.object({
  collectionCount: z.number().meta({
    description: '已清理的 collection 数量'
  })
});
export type DisableCollectionPermissionResponse = z.infer<
  typeof DisableCollectionPermissionResponseSchema
>;

/* ============================================================================
 * API: 创建知识库文件夹
 * Route: POST /api/core/dataset/folder/create
 * ============================================================================ */
export const CreateDatasetFolderBodySchema = z.object({
  parentId: ParentIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '父级文件夹 ID,不传则创建在根目录'
  }),
  name: z.string().meta({
    example: '我的文件夹',
    description: '文件夹名称'
  }),
  intro: z.string().meta({
    example: '存放产品相关知识库',
    description: '文件夹简介'
  }),
  inheritPermission: InheritPermissionInputSchema
});
export type CreateDatasetFolderBody = WithOptionalInheritPermission<
  z.infer<typeof CreateDatasetFolderBodySchema>
>;

/* ============================================================================
 * API: 搜索测试
 * Route: POST /api/core/dataset/searchTest
 * Method: POST
 * Description: 对单个知识库执行文本、图片或图文检索，返回可读集合的命中片段和实际检索配置。
 * Tags: ['Dataset', 'Read']
 * ============================================================================ */

const SearchDatasetTestTextSchema = z.string().meta({
  example: 'FastGPT 是什么',
  description: '检索文本，可与 queryImageUrls 一起进行图文检索'
});

const SearchDatasetTestImagesSchema = z
  .array(z.string().min(1))
  .max(10, '最多支持上传10张图片')
  .meta({
    example: ['temp/teamId/search-image.png'],
    description:
      '检索图片的临时对象 key 列表，最多 10 张，并非图片 URL。先调用 /core/dataset/file/presignSearchTestImage 并完成上传，再传返回的 temp/${teamId}/... key；仅接受当前团队的临时 key，不接受公网 URL、dataset key 或 chat key。可与 text 同时传入'
  });

const SearchDatasetTestOptionsSchema = z.object({
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  }),
  similarity: z.number().optional().meta({
    example: 0.3,
    default: 0,
    description:
      '最低分数阈值，默认 0。实际启用重排序时按重排分数过滤，否则仅向量检索按向量相似度过滤；全文检索、混合检索未启用重排序时不按此阈值过滤'
  }),
  limit: z.number().optional().meta({
    example: 5000,
    default: 5000,
    description: '召回内容的最大 token 预算，并非结果条数。默认 5000，超过 20000 时按 20000 处理'
  }),
  searchMode: z.enum(DatasetSearchModeEnum).optional().meta({
    example: DatasetSearchModeEnum.mixedRecall,
    default: DatasetSearchModeEnum.embedding,
    description:
      '召回模式：embedding=向量检索，fullTextRecall=全文检索，mixedRecall=混合检索；默认 embedding'
  }),
  embeddingWeight: z.number().optional().meta({
    example: 0.5,
    default: 0.5,
    description: '混合检索中向量召回的融合权重，全文召回权重为 1 - embeddingWeight；默认 0.5'
  }),
  usingReRank: z.boolean().optional().meta({
    example: false,
    default: false,
    description:
      '是否对文本召回结果重排序，默认 false；需要非空检索文本和可用的重排序模型，纯图片检索不重排。实际是否使用以响应 usingReRank 为准'
  }),
  rerankModelId: z.string().optional().meta({
    description: '重排序模型 ID，usingReRank=true 时使用；未指定或模型配置失效时尝试团队默认模型'
  }),
  rerankModel: z.string().optional().meta({
    example: 'bge-reranker-v2-m3',
    description: '旧版重排序模型标识',
    deprecated: true
  }),
  rerankWeight: z.number().optional().meta({
    example: 0.5,
    default: 0.5,
    description:
      '重排结果的融合权重，原始召回结果权重为 1 - rerankWeight；默认 0.5，1 表示仅使用重排排序'
  }),
  datasetSearchUsingExtensionQuery: z.boolean().optional().meta({
    example: false,
    default: false,
    description:
      '是否在普通检索前对文本问题扩展，默认 false；纯图片输入不执行文本扩展，深度搜索使用独立流程'
  }),
  datasetSearchExtensionModelId: z.string().optional().meta({
    description: '问题扩展模型 ID，开启问题扩展时使用；未指定或模型配置失效时尝试团队默认语言模型'
  }),
  datasetSearchExtensionModel: z.string().optional().meta({
    example: 'gpt-4o-mini',
    description: '旧版问题扩展模型标识',
    deprecated: true
  }),
  datasetSearchExtensionBg: z.string().optional().meta({
    example: '根据 FastGPT 产品文档扩展用户问题',
    description: '问题扩展的背景信息，用于辅助生成检索问题'
  }),
  datasetDeepSearch: z.boolean().optional().meta({
    example: false,
    default: false,
    description:
      '是否启用深度搜索，默认 false；仅 text 包含非空白内容时进入深度搜索，纯图片输入仍使用普通检索'
  }),
  datasetDeepSearchModelId: z.string().optional().meta({
    description: '深度搜索使用的语言模型 ID，需具备该模型的使用权限'
  }),
  datasetDeepSearchModel: z.string().optional().meta({
    example: 'gpt-4o-mini',
    description: '旧版深度搜索模型标识',
    deprecated: true
  }),
  datasetDeepSearchMaxTimes: z.number().optional().meta({
    example: 3,
    description: '深度搜索的最大迭代轮次，仅在实际进入深度搜索时生效'
  }),
  datasetDeepSearchBg: z.string().optional().meta({
    example: '结合产品功能与使用场景检索相关资料',
    description: '深度搜索的背景信息，仅在实际进入深度搜索时生效'
  })
});

/** 文本和图片至少提供一种，保留图文同时输入；分支必填字段优先展示，公共检索参数复用。 */
export const SearchDatasetTestBodySchema = z.union([
  z
    .object({
      text: SearchDatasetTestTextSchema.min(1)
        .refine((text) => !!text.trim(), {
          message: 'text or queryImageUrls is required'
        })
        .meta(SearchDatasetTestTextSchema.meta() ?? {}),
      queryImageUrls: SearchDatasetTestImagesSchema.optional().default([]),
      ...SearchDatasetTestOptionsSchema.shape
    })
    .meta({
      title: '文本检索',
      description:
        'text 必填且不能全为空白；可同时传 queryImageUrls 进行图文检索，不传图片时默认为空数组。'
    }),
  z
    .object({
      queryImageUrls: SearchDatasetTestImagesSchema.min(1).meta(
        SearchDatasetTestImagesSchema.meta() ?? {}
      ),
      text: SearchDatasetTestTextSchema.optional().default(''),
      ...SearchDatasetTestOptionsSchema.shape
    })
    .meta({
      title: '图片检索',
      description:
        'queryImageUrls 必填，包含 1～10 个已上传的当前团队临时图片 key；可同时传 text，省略时默认为空字符串。'
    })
]);
export type SearchDatasetTestBody = z.infer<typeof SearchDatasetTestBodySchema>;

export const SearchDatasetTestResponseSchema = z.object({
  list: z.array(SearchDataResponseItemSchema).meta({
    description: '当前调用者可读集合中的命中片段列表，包含内容、来源和召回分数；没有命中时为空数组'
  }),
  duration: z.string().meta({
    example: '0.523s',
    description: '搜索测试耗时，单位为秒，例如 0.523s'
  }),
  limit: z.number().meta({
    example: 5000,
    description: '实际使用的召回 token 预算，上限 20000，并非结果条数'
  }),
  searchMode: z.enum(DatasetSearchModeEnum).meta({
    description: '实际使用的搜索模式'
  }),
  usingReRank: z.boolean().meta({
    description: '本次是否实际使用重排序；输入不足、模型不可用或重排失败时可能为 false'
  }),
  similarity: z.number().meta({
    description: '实际使用的相似度阈值'
  }),
  queryExtensionModel: z.string().optional().meta({
    description: '问题扩展实际使用的模型标识，未执行问题扩展时不返回'
  })
});
export type SearchDatasetTestResponse = z.infer<typeof SearchDatasetTestResponseSchema>;

/* ============================================================================
 * API: 导出知识库全部数据
 * Route: GET /api/core/dataset/exportAll
 * Description: 流式输出 CSV 文件
 * ============================================================================ */
export const ExportDatasetQuerySchema = z.object({
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  })
});
export type ExportDatasetQuery = z.infer<typeof ExportDatasetQuerySchema>;

/* ============================================================================
 * API: 获取知识库引用权限
 * Route: GET /api/core/dataset/getPermission
 * ============================================================================ */
export const GetDatasetPermissionQuerySchema = z.object({
  id: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  })
});
export type GetDatasetPermissionQuery = z.infer<typeof GetDatasetPermissionQuerySchema>;

export const GetDatasetPermissionResponseSchema = z.object({
  datasetName: z.string().meta({
    example: '产品文档知识库',
    description: '知识库名称'
  }),
  permission: z.object({
    hasWritePer: z.boolean().meta({
      example: true,
      description: '是否有写权限'
    }),
    hasReadPer: z.boolean().meta({
      example: true,
      description: '是否有读权限'
    })
  })
});
export type GetDatasetPermissionResponse = z.infer<typeof GetDatasetPermissionResponseSchema>;
