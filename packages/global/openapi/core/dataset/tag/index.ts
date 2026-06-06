import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import { PaginationResponseSchema, PaginationSchema } from '../../../api';
import z from 'zod';
import {
  CreateDatasetCollectionTagBodySchema,
  AddTagsToCollectionsBodySchema,
  UpdateDatasetCollectionTagBodySchema,
  BatchUpsertTagsBodySchema,
  SetCollectionTagsBodySchema,
  BatchSetCollectionTagsBodySchema,
  GetTagUsageQuerySchema,
  GetTagUsageResponseSchema
} from '../collection/tagApi';

/* ============================================================================
 * API: 获取标签列表（分页）
 * Route: POST /proApi/core/dataset/tag/list
 * ============================================================================ */
export const GetTagListBodySchema = PaginationSchema.extend({
  datasetId: z.string().meta({ description: '数据集 ID' }),
  searchText: z.string().optional().meta({ description: '标签名搜索关键词' })
});
export type GetTagListBody = z.infer<typeof GetTagListBodySchema>;

export const DatasetTagItemSchema = z.object({
  _id: z.string().meta({ description: '标签 ID' }),
  tag: z.string().meta({ description: '标签名称' }),
  tagType: z.enum(['string', 'number', 'datetime']).optional().meta({
    description: '标签类型: string=文本, number=数字, datetime=日期时间'
  })
});

/* ============================================================================
 * API: 获取全部标签列表（不分页）
 * Route: GET /proApi/core/dataset/tag/getAllTags
 * ============================================================================ */
export const GetAllTagsQuerySchema = z.object({
  datasetId: z.string().meta({ description: '数据集 ID' })
});
export type GetAllTagsQuery = z.infer<typeof GetAllTagsQuerySchema>;

export const GetAllTagsResponseSchema = z.object({
  list: z.array(DatasetTagItemSchema).meta({ description: '标签列表' })
});

/* ============================================================================
 * API: 删除标签
 * Route: DELETE /proApi/core/dataset/tag/delete
 * ============================================================================ */
export const DeleteTagQuerySchema = z.object({
  id: z.string().meta({ description: '标签 ID' }),
  datasetId: z.string().meta({ description: '数据集 ID' })
});
export type DeleteTagQuery = z.infer<typeof DeleteTagQuerySchema>;

export const GetTagListResponseSchema = PaginationResponseSchema(DatasetTagItemSchema);

export const DatasetTagPath: OpenAPIPath = {
  '/core/dataset/tag/create': {
    post: {
      summary: '创建标签',
      description: '在指定知识库中创建一个新标签，需要写权限',
      tags: [TagsMap.datasetTag],
      requestBody: {
        content: { 'application/json': { schema: CreateDatasetCollectionTagBodySchema } }
      },
      responses: {
        200: { description: '成功返回新创建的标签 ID' }
      }
    }
  },

  '/core/dataset/tag/list': {
    post: {
      summary: '获取标签列表（分页）',
      description: '分页查询知识库的标签列表，支持按标签名搜索',
      tags: [TagsMap.datasetTag],
      requestBody: {
        content: { 'application/json': { schema: GetTagListBodySchema } }
      },
      responses: {
        200: {
          description: '成功返回标签分页列表和总数',
          content: { 'application/json': { schema: GetTagListResponseSchema } }
        }
      }
    }
  },

  '/core/dataset/tag/getAllTags': {
    get: {
      summary: '获取全部标签列表（不分页）',
      description: '获取知识库的全部标签列表（不分页），需要读权限',
      tags: [TagsMap.datasetTag],
      requestParams: {
        query: GetAllTagsQuerySchema
      },
      responses: {
        200: {
          description: '成功返回全部标签列表',
          content: { 'application/json': { schema: GetAllTagsResponseSchema } }
        }
      }
    }
  },

  '/core/dataset/tag/update': {
    post: {
      summary: '更新标签',
      description: '更新指定标签的名称或类型，需要写权限',
      tags: [TagsMap.datasetTag],
      requestBody: {
        content: { 'application/json': { schema: UpdateDatasetCollectionTagBodySchema } }
      },
      responses: {
        200: { description: '更新成功' }
      }
    }
  },

  '/core/dataset/tag/delete': {
    delete: {
      summary: '删除标签',
      description: '删除指定标签，需要所有者权限',
      tags: [TagsMap.datasetTag],
      requestParams: {
        query: DeleteTagQuerySchema
      },
      responses: {
        200: { description: '删除成功' }
      }
    }
  },

  '/core/dataset/tag/batchUpsert': {
    post: {
      summary: '批量新增/修改标签',
      description: '批量新增或更新标签，需要写权限',
      tags: [TagsMap.datasetTag],
      requestBody: {
        content: { 'application/json': { schema: BatchUpsertTagsBodySchema } }
      },
      responses: {
        200: { description: '操作成功' }
      }
    }
  },

  '/core/dataset/tag/tagUsage': {
    get: {
      summary: '查询标签使用情况',
      description: '查询标签在集合中的使用情况，返回每个标签关联的集合 ID 列表',
      tags: [TagsMap.datasetTag],
      requestParams: {
        query: GetTagUsageQuerySchema
      },
      responses: {
        200: {
          description: '成功返回标签使用情况',
          content: { 'application/json': { schema: GetTagUsageResponseSchema } }
        }
      }
    }
  },

  '/core/dataset/tag/setCollectionTags': {
    post: {
      summary: '设置集合的标签值',
      description: '为指定集合设置标签值，需要写权限',
      tags: [TagsMap.datasetTag],
      requestBody: {
        content: { 'application/json': { schema: SetCollectionTagsBodySchema } }
      },
      responses: {
        200: { description: '设置成功' }
      }
    }
  },

  '/core/dataset/tag/batchSetCollectionTags': {
    post: {
      summary: '批量设置集合的标签值',
      description: '批量为多个集合设置标签值，同时支持删除标签，需要写权限',
      tags: [TagsMap.datasetTag],
      requestBody: {
        content: { 'application/json': { schema: BatchSetCollectionTagsBodySchema } }
      },
      responses: {
        200: { description: '设置成功' }
      }
    }
  },

  '/core/dataset/tag/addToCollections': {
    post: {
      summary: '批量为集合添加标签',
      description: '将源集合的标签复制到目标集合，用于批量标签操作',
      tags: [TagsMap.datasetTag],
      requestBody: {
        content: { 'application/json': { schema: AddTagsToCollectionsBodySchema } }
      },
      responses: {
        200: { description: '操作成功' }
      }
    }
  }
};
