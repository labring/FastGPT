import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  DeleteCollectionBodySchema,
  DeleteCollectionQuerySchema,
  ExportCollectionBodySchema,
  GetCollectionDetailQuerySchema,
  GetCollectionDetailResponseSchema,
  GetCollectionPathsQuerySchema,
  GetCollectionPathsResponseSchema,
  GetCollectionTrainingDetailQuerySchema,
  GetCollectionTrainingDetailResponseSchema,
  ListCollectionV2BodySchema,
  ListCollectionV2ResponseSchema,
  ReadCollectionSourceBodySchema,
  ReadCollectionSourceResponseSchema,
  ScrollCollectionsBodySchema,
  SyncCollectionBodySchema,
  SyncCollectionResponseSchema,
  UpdateDatasetCollectionBodySchema
} from './api';
import { DatasetCollectionCreatePath } from './createPath';
import {
  CheckDuplicateFileNamesBodySchema,
  CheckDuplicateFileNamesResponseSchema,
  CheckMd5DuplicateBodySchema,
  CheckMd5DuplicateResponseSchema
} from './checkApi';

export const DatasetCollectionPath: OpenAPIPath = {
  ...DatasetCollectionCreatePath,
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
          description: '成功返回集合详情',
          content: {
            'application/json': { schema: GetCollectionDetailResponseSchema }
          }
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
          description: '成功返回集合列表和总数',
          content: {
            'application/json': { schema: ListCollectionV2ResponseSchema }
          }
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
          description: '成功返回路径列表',
          content: {
            'application/json': { schema: GetCollectionPathsResponseSchema }
          }
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
          description: '成功返回资源 URL',
          content: {
            'application/json': { schema: ReadCollectionSourceResponseSchema }
          }
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
          description: '成功返回同步结果（success / sameRaw / failed）',
          content: {
            'application/json': { schema: SyncCollectionResponseSchema }
          }
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
  },
  '/core/dataset/collection/trainingDetail': {
    get: {
      summary: '获取集合训练详情',
      description: '获取集合的训练状态，包括排队中、训练中、错误数量及已完成的数据量',
      tags: [TagsMap.datasetCollection],
      requestParams: {
        query: GetCollectionTrainingDetailQuerySchema
      },
      responses: {
        200: {
          description: '成功返回训练详情',
          content: {
            'application/json': {
              schema: GetCollectionTrainingDetailResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/dataset/collection/check/duplicate': {
    post: {
      summary: '检查集合名称重复',
      description: '检查指定知识库下的文件名是否已存在，用于上传前的去重校验',
      tags: [TagsMap.datasetCollection],
      requestBody: {
        content: {
          'application/json': {
            schema: CheckDuplicateFileNamesBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回重复的文件名列表',
          content: {
            'application/json': { schema: CheckDuplicateFileNamesResponseSchema }
          }
        }
      }
    }
  },
  '/core/dataset/collection/check/md5Duplicate': {
    post: {
      summary: '检查文件 MD5 重复',
      description: '检查文件 MD5 的重复情况，包含同批次内重复和与知识库已有文件的重复',
      tags: [TagsMap.datasetCollection],
      requestBody: {
        content: {
          'application/json': {
            schema: CheckMd5DuplicateBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回重复文件列表，包含重复类型和已存在的文件名',
          content: {
            'application/json': { schema: CheckMd5DuplicateResponseSchema }
          }
        }
      }
    }
  }
};
