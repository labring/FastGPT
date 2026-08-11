import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  BatchSetCollectionTagsBodySchema,
  BatchUpsertTagsBodySchema,
  CreateDatasetCollectionTagBodySchema,
  DeleteDatasetCollectionTagQuerySchema,
  GetAllDatasetTagsQuerySchema,
  SetCollectionTagsBodySchema,
  UpdateDatasetCollectionTagBodySchema
} from '../collection/tagApi';

export const DatasetTagPath: OpenAPIPath = {
  '/proApi/core/dataset/tag/create': {
    post: {
      summary: '创建标签',
      description: '在指定知识库下创建一个新标签',
      tags: [DevApiTagsMap.datasetTag],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateDatasetCollectionTagBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回新创建的标签信息'
        }
      }
    }
  },
  '/proApi/core/dataset/tag/update': {
    post: {
      summary: '更新标签',
      description: '更新指定标签的名称',
      tags: [DevApiTagsMap.datasetTag],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateDatasetCollectionTagBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回更新后的标签信息'
        }
      }
    }
  },
  '/proApi/core/dataset/tag/delete': {
    delete: {
      summary: '删除标签',
      description: '根据标签 ID 删除指定知识库下的标签',
      tags: [DevApiTagsMap.datasetTag],
      requestParams: {
        query: DeleteDatasetCollectionTagQuerySchema
      },
      responses: {
        200: {
          description: '成功删除标签'
        }
      }
    }
  },
  '/proApi/core/dataset/tag/getAllTags': {
    get: {
      summary: '获取全部标签',
      description: '获取指定知识库下的全部标签',
      tags: [DevApiTagsMap.datasetTag],
      requestParams: {
        query: GetAllDatasetTagsQuerySchema
      },
      responses: {
        200: {
          description: '成功返回全部标签列表'
        }
      }
    }
  },
  '/proApi/core/dataset/tag/batchUpsert': {
    post: {
      summary: '批量管理标签',
      description:
        '全量创建标签。已存在的跳过，不存在的创建，缺少的删除；修改类型需要先调用delete接口',
      tags: [DevApiTagsMap.datasetTag],
      requestBody: {
        content: {
          'application/json': {
            schema: BatchUpsertTagsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回批量操作结果'
        }
      }
    }
  },
  '/proApi/core/dataset/tag/setCollectionTags': {
    post: {
      summary: '设置集合标签值',
      description: '为单个集合设置标签值',
      tags: [DevApiTagsMap.datasetTag],
      requestBody: {
        content: {
          'application/json': {
            schema: SetCollectionTagsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回操作结果'
        }
      }
    }
  },
  '/proApi/core/dataset/tag/batchSetCollectionTags': {
    post: {
      summary: '批量设置集合标签值',
      description: '为多个集合批量设置标签值',
      tags: [DevApiTagsMap.datasetTag],
      requestBody: {
        content: {
          'application/json': {
            schema: BatchSetCollectionTagsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回批量操作结果'
        }
      }
    }
  }
};
