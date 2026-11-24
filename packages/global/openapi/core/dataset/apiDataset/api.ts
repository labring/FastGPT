import { z } from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { DatasetCollectionTypeEnum } from '../../../../core/dataset/constants';
import {
  APIFileItemSchema,
  ApiDatasetServerSchema
} from '../../../../core/dataset/apiDataset/type';

/* ============================================================================
 * API: 获取第三方知识库目录（仅文件夹）
 * Route: POST /api/core/dataset/apiDataset/getCatalog
 * ============================================================================ */
export const GetApiDatasetCatalogBodySchema = z.object({
  searchKey: z.string().optional().meta({
    example: '产品文档',
    description: '搜索关键词'
  }),
  parentId: z.string().nullish().meta({
    example: '68ad85a7463006c963799a05',
    description: '父级节点 ID，不传或 null 表示根目录'
  }),
  apiDatasetServer: ApiDatasetServerSchema.optional().meta({
    description: '第三方知识库服务器配置（API/飞书/语雀/钉钉）'
  })
});
export type GetApiDatasetCatalogBody = z.infer<typeof GetApiDatasetCatalogBodySchema>;

export const GetApiDatasetCatalogResponseSchema = z.array(APIFileItemSchema).meta({
  description: '目录列表（仅包含 hasChild = true 的节点）'
});
export type GetApiDatasetCatalogResponse = z.infer<typeof GetApiDatasetCatalogResponseSchema>;

/* ============================================================================
 * API: 获取第三方知识库节点完整路径
 * Route: POST /api/core/dataset/apiDataset/getPathNames
 * ============================================================================ */
export const GetApiDatasetPathNamesBodySchema = z.object({
  datasetId: ObjectIdSchema.optional().meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID，传入时从知识库配置中读取 apiDatasetServer'
  }),
  parentId: z.string().nullish().meta({
    example: '68ad85a7463006c963799a05',
    description: '当前节点 ID，不传或 null 时返回空字符串'
  }),
  apiDatasetServer: ApiDatasetServerSchema.optional().meta({
    description: '第三方知识库服务器配置，datasetId 不传时必须提供'
  })
});
export type GetApiDatasetPathNamesBody = z.infer<typeof GetApiDatasetPathNamesBodySchema>;

export const GetApiDatasetPathNamesResponseSchema = z.string().meta({
  example: '/根目录/产品文档/介绍',
  description: '节点的完整路径字符串'
});
export type GetApiDatasetPathNamesResponse = z.infer<typeof GetApiDatasetPathNamesResponseSchema>;

/* ============================================================================
 * API: 获取第三方知识库文件列表
 * Route: POST /api/core/dataset/apiDataset/list
 * Description: 浏览第三方文件；语雀目录和知识库列表使用 3 分钟快照，正式导入与同步不复用浏览缓存。
 * ============================================================================ */
export const GetApiDatasetFileListBodySchema = z.object({
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  }),
  searchKey: z.string().optional().meta({
    example: '产品文档',
    description: '搜索关键词'
  }),
  parentId: z.string().nullish().meta({
    example: '68ad85a7463006c963799a05',
    description: '父级节点 ID，不传或 null 表示根目录'
  })
});
export type GetApiDatasetFileListBody = z.infer<typeof GetApiDatasetFileListBodySchema>;

export const GetApiDatasetFileListResponseSchema = z.array(APIFileItemSchema).meta({
  description: '文件/文件夹列表'
});
export type GetApiDatasetFileListResponse = z.infer<typeof GetApiDatasetFileListResponseSchema>;

/* ============================================================================
 * API: 获取第三方知识库已存在的 apiFileId 列表
 * Route: GET /api/core/dataset/apiDataset/listExistId
 * ============================================================================ */
export const GetApiDatasetFileListExistIdQuerySchema = z.object({
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  })
});
export type GetApiDatasetFileListExistIdQuery = z.infer<
  typeof GetApiDatasetFileListExistIdQuerySchema
>;

export const GetApiDatasetFileListExistIdResponseSchema = z.array(z.string()).meta({
  description: '已存在集合对应的 apiFileId 列表'
});
export type GetApiDatasetFileListExistIdResponse = z.infer<
  typeof GetApiDatasetFileListExistIdResponseSchema
>;

/* ============================================================================
 * API: 获取第三方知识库本地同步范围状态
 * Route: GET /api/core/dataset/apiDataset/syncState
 * ============================================================================ */
export const GetApiDatasetSyncStateQuerySchema = z.object({
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  })
});
export type GetApiDatasetSyncStateQuery = z.infer<typeof GetApiDatasetSyncStateQuerySchema>;

export const ApiDatasetSyncStateCollectionItemSchema = z.object({
  collectionId: ObjectIdSchema.meta({ description: '本地集合 ID' }),
  apiFileId: z.string().meta({ description: '本地存储的 apiFileId（派生目录含 #dir 后缀）' }),
  sourceId: z.string().meta({ description: '对应的真实远端节点 ID' }),
  type: z.enum(DatasetCollectionTypeEnum).meta({ description: '本地集合类型' }),
  syncChildren: z.boolean().meta({ description: '是否自动同步新增直属子级' }),
  parentId: ObjectIdSchema.nullable().meta({ description: '本地父集合 ID' })
});
export type ApiDatasetSyncStateCollectionItem = z.infer<
  typeof ApiDatasetSyncStateCollectionItemSchema
>;

export const GetApiDatasetSyncStateResponseSchema = z.object({
  syncAll: z.boolean().meta({
    description: '是否开启整库全量同步（开启后同步远端全部新增内容并覆盖已暂停子目录）'
  }),
  collections: z
    .array(ApiDatasetSyncStateCollectionItemSchema)
    .meta({ description: '当前用户可读的已导入 API 集合及其同步状态' })
});
export type GetApiDatasetSyncStateResponse = z.infer<typeof GetApiDatasetSyncStateResponseSchema>;
