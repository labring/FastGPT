import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  CreateCollectionBodySchema,
  DeleteCollectionBodySchema,
  DeleteCollectionQuerySchema,
  ExportCollectionBodySchema,
  GetCollectionDetailQuerySchema,
  GetCollectionPathsQuerySchema,
  ListCollectionV2BodySchema,
  ReadCollectionSourceBodySchema,
  ScrollCollectionsBodySchema,
  SyncCollectionBodySchema,
  UpdateDatasetCollectionBodySchema
} from './api';

export const DatasetCollectionPath: OpenAPIPath = {
  '/core/dataset/collection/create': {
    post: {
      summary: '创建集合',
      description: '创建数据集集合，支持多种类型（文件、链接、文本、API 等）',
      tags: [TagsMap.datasetCollection],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateCollectionBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回新创建的集合 ID'
        }
      }
    }
  },
  '/core/dataset/collection/delete': {
    delete: {
      summary: '删除集合',
      description: '删除一个或多个集合及其子集合，支持通过 query.id 或 body.collectionIds 指定',
      tags: [TagsMap.datasetCollection],
      requestParams: {
        query: DeleteCollectionQuerySchema
      },
      requestBody: {
        content: {
          'application/json': {
            schema: DeleteCollectionBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功删除集合'
        }
      }
    }
  },
  '/core/dataset/collection/detail': {
    get: {
      summary: '获取集合详情',
      description: '获取集合详细信息，包括索引数量、错误数量、文件信息等',
      tags: [TagsMap.datasetCollection],
      requestParams: {
        query: GetCollectionDetailQuerySchema
      },
      responses: {
        200: {
          description: '成功返回集合详情'
        }
      }
    }
  },
  '/core/dataset/collection/listV2': {
    post: {
      summary: '获取集合列表（分页）',
      description: '获取数据集集合列表，支持分页、搜索、标签过滤',
      tags: [TagsMap.datasetCollection],
      requestBody: {
        content: {
          'application/json': {
            schema: ListCollectionV2BodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回集合列表和总数'
        }
      }
    }
  },
  '/core/dataset/collection/scrollList': {
    post: {
      summary: '获取数据集集合列表（滚动分页）',
      description: '获取数据集集合列表（滚动分页）',
      tags: [TagsMap.datasetCollection],
      requestBody: {
        content: {
          'application/json': {
            schema: ScrollCollectionsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回集合列表'
        }
      }
    }
  },
  '/core/dataset/collection/update': {
    post: {
      summary: '更新数据集集合信息',
      description: '更新数据集集合信息，支持通过集合ID或数据集ID+外部文件ID定位集合',
      tags: [TagsMap.datasetCollection],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateDatasetCollectionBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新集合信息'
        }
      }
    }
  },
  '/core/dataset/collection/paths': {
    get: {
      summary: '获取集合面包屑路径',
      description: '从指定集合向上递归获取父级路径链，用于面包屑导航',
      tags: [TagsMap.datasetCollection],
      requestParams: {
        query: GetCollectionPathsQuerySchema
      },
      responses: {
        200: {
          description: '成功返回路径列表'
        }
      }
    }
  },
  '/core/dataset/collection/read': {
    post: {
      summary: '获取集合资源 URL',
      description: '获取集合原始文件的访问 URL，支持直接鉴权和对话中鉴权两种模式',
      tags: [TagsMap.datasetCollection],
      requestBody: {
        content: {
          'application/json': {
            schema: ReadCollectionSourceBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回资源 URL'
        }
      }
    }
  },
  '/core/dataset/collection/sync': {
    post: {
      summary: '同步集合',
      description: '重新拉取集合原始内容并更新数据，支持链接类型和 API 数据集类型',
      tags: [TagsMap.datasetCollection],
      requestBody: {
        content: {
          'application/json': {
            schema: SyncCollectionBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回同步结果（success / sameRaw / failed）'
        }
      }
    }
  },
  '/core/dataset/collection/export': {
    post: {
      summary: '下载集合的所有数据块',
      description: '下载集合的所有数据块',
      tags: [TagsMap.datasetCollection],
      requestBody: {
        content: {
          'application/json': {
            schema: ExportCollectionBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功导出并下载集合的所有数据块内容'
        }
      }
    }
  }
};
