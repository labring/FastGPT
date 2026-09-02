import { z } from 'zod';
import { DatasetSearchModeEnum, DatasetTypeEnum } from '../../../core/dataset/constants';
import { ApiDatasetServerSchema } from '../../../core/dataset/apiDataset/type';
import { ObjectIdSchema } from '../../../common/type/mongo';
import { ParentIdSchema } from '../../../common/parentFolder/type';
import {
  ChunkSettingsSchema,
  DatasetItemSchema,
  DatasetListItemSchema,
  SearchDataResponseItemSchema
} from '../../../core/dataset/type';
import {
  CollaboratorListSchema,
  CollaboratorUpdateListSchema,
  ShowUsernameQuerySchema
} from '../../../support/permission/collaborator.schema';

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
  avatar: z.string().meta({
    example: '/imgs/dataset/avatar.png',
    description: '知识库头像'
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
  vlmModelId: z.string().optional().meta({
    description: '视觉语言模型 ID'
  }),
  vlmModel: z.string().optional().meta({
    example: 'gpt-4o',
    description: '视觉语言模型标识',
    deprecated: true
  }),
  apiDatasetServer: ApiDatasetServerSchema.optional().meta({
    description: '第三方知识库服务器配置(API/飞书/语雀/钉钉)'
  })
});

export type CreateDatasetBody = z.infer<typeof CreateDatasetBodySchema>;

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
      avatar: z.string().meta({
        example: '/imgs/dataset/avatar.png',
        description: '知识库头像'
      }),
      parentId: ParentIdSchema.meta({
        example: '68ad85a7463006c963799a05',
        description: '父级文件夹 ID'
      }),
      vectorModelId: z.string().optional().meta({ description: '向量模型 ID' }),
      agentModelId: z.string().optional().meta({ description: 'Agent 模型 ID' }),
      vlmModelId: z.string().optional().meta({ description: '视觉语言模型 ID' })
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
  avatar: z.string().meta({
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
 * ============================================================================ */
export const GetDatasetListBodySchema = z.object({
  parentId: ParentIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '父级文件夹 ID,null 或不传表示根目录'
  }),
  type: z.enum(DatasetTypeEnum).optional().meta({
    example: DatasetTypeEnum.dataset,
    description: '知识库类型筛选'
  }),
  searchKey: z.string().optional().meta({
    example: '产品文档',
    description: '搜索关键词,按名称和简介模糊匹配'
  })
});
export type GetDatasetListBody = z.infer<typeof GetDatasetListBodySchema>;

// 出参复用 DatasetListItemSchema
export const GetDatasetListResponseSchema = z.array(DatasetListItemSchema);
export type GetDatasetListResponse = z.infer<typeof GetDatasetListResponseSchema>;

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
  agentModelId: z.string().optional().meta({
    description: '知识库 Agent 模型 ID'
  }),
  vlmModelId: z.string().optional().meta({
    description: '视觉语言模型 ID'
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
  })
});
export type CreateDatasetFolderBody = z.infer<typeof CreateDatasetFolderBodySchema>;

/* ============================================================================
 * API: 搜索测试
 * Route: POST /api/core/dataset/searchTest
 * ============================================================================ */
export const SearchDatasetTestBodySchema = z
  .object({
    datasetId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a05',
      description: '知识库 ID'
    }),
    text: z.string().optional().default('').meta({
      example: 'FastGPT 是什么',
      description: '搜索文本'
    }),
    queryImageUrls: z
      .array(z.string().min(1))
      .max(10, '最多支持上传10张图片')
      .optional()
      .default([])
      .meta({
        example: ['temp/teamId/search-image.png'],
        description:
          '搜索测试图片临时 key，最多 10 张。需先调用 /api/core/dataset/file/presignSearchTestImage 获取预签名上传 URL 和 temp/${teamId}/... key，不支持直接传公网 URL、dataset key 或 chat key'
      }),
    similarity: z.number().optional().meta({
      example: 0.3,
      description: '最低相似度阈值'
    }),
    limit: z.number().optional().meta({
      example: 5000,
      description: '最大返回 token 数'
    }),
    searchMode: z.enum(DatasetSearchModeEnum).optional().meta({
      example: DatasetSearchModeEnum.mixedRecall,
      description: '搜索模式'
    }),
    embeddingWeight: z.number().optional().meta({
      example: 1,
      description: '向量搜索权重'
    }),
    usingReRank: z.boolean().optional().meta({
      description: '是否使用重排序'
    }),
    rerankModelId: z.string().optional().meta({
      description: '重排序模型 ID'
    }),
    rerankModel: z.string().optional().meta({
      example: 'bge-reranker-v2-m3',
      description: '旧版重排序模型标识',
      deprecated: true
    }),
    rerankWeight: z.number().optional().meta({
      description: '重排序权重'
    }),
    datasetSearchUsingExtensionQuery: z.boolean().optional().meta({
      description: '是否使用问题扩展'
    }),
    datasetSearchExtensionModelId: z.string().optional().meta({
      description: '问题扩展模型 ID'
    }),
    datasetSearchExtensionModel: z.string().optional().meta({
      example: 'gpt-4o-mini',
      description: '旧版问题扩展模型标识',
      deprecated: true
    }),
    datasetSearchExtensionBg: z.string().optional().meta({
      description: '问题扩展背景描述'
    }),
    datasetDeepSearch: z.boolean().optional().meta({
      description: '是否启用深度搜索'
    }),
    datasetDeepSearchModelId: z.string().optional().meta({
      description: '深度搜索模型 ID'
    }),
    datasetDeepSearchModel: z.string().optional().meta({
      example: 'gpt-4o-mini',
      description: '旧版深度搜索模型标识',
      deprecated: true
    }),
    datasetDeepSearchMaxTimes: z.number().optional().meta({
      description: '深度搜索最大轮次'
    }),
    datasetDeepSearchBg: z.string().optional().meta({
      description: '深度搜索背景描述'
    })
  })
  .refine((data) => !!data.text.trim() || data.queryImageUrls.length > 0, {
    message: 'text or queryImageUrls is required'
  });
export type SearchDatasetTestBody = z.infer<typeof SearchDatasetTestBodySchema>;

export const SearchDatasetTestResponseSchema = z.object({
  list: z.array(SearchDataResponseItemSchema).meta({
    description: '搜索结果列表'
  }),
  duration: z.string().meta({
    example: '0.523s',
    description: '搜索耗时'
  }),
  limit: z.number().meta({
    description: '实际使用的最大 token 数'
  }),
  searchMode: z.enum(DatasetSearchModeEnum).meta({
    description: '实际使用的搜索模式'
  }),
  usingReRank: z.boolean().meta({
    description: '是否使用了重排序'
  }),
  similarity: z.number().meta({
    description: '实际使用的相似度阈值'
  }),
  queryExtensionModel: z.string().optional().meta({
    description: '问题扩展使用的模型'
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
