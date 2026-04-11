import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  GetDatasetDataDetailQuerySchema,
  UpdateDatasetDataBodySchema,
  DeleteDatasetDataQuerySchema,
  GetQuoteDataBodySchema,
  InsertDataBodySchema,
  InsertImagesBodySchema,
  PushDataBodySchema,
  GetDatasetDataListBodySchema,
  GetDatasetDataListLegacyBodySchema
} from './api';

export const DatasetDataPath: OpenAPIPath = {
  '/core/dataset/data/v2/list': {
    post: {
      summary: '获取数据列表',
      description: '分页查询集合内的数据列表，支持关键词搜索，包含图片预览 URL',
      tags: [TagsMap.datasetData],
      requestBody: {
        content: {
          'application/json': {
            schema: GetDatasetDataListBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回分页数据列表'
        }
      }
    }
  },
  '/core/dataset/data/detail': {
    get: {
      summary: '获取数据详情',
      description: '获取单条数据集数据的详细信息，包括向量索引',
      tags: [TagsMap.datasetData],
      requestParams: {
        query: GetDatasetDataDetailQuerySchema
      },
      responses: {
        200: {
          description: '成功返回数据详情'
        }
      }
    }
  },

  '/core/dataset/data/update': {
    put: {
      summary: '更新数据',
      description: '更新数据集数据的 q、a 和向量索引，触发重新向量化',
      tags: [TagsMap.datasetData],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateDatasetDataBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '更新成功'
        }
      }
    }
  },

  '/core/dataset/data/delete': {
    delete: {
      summary: '删除数据',
      description: '删除指定数据集数据，需要写权限',
      tags: [TagsMap.datasetData],
      requestParams: {
        query: DeleteDatasetDataQuerySchema
      },
      responses: {
        200: {
          description: '删除成功'
        }
      }
    }
  },

  '/core/dataset/data/getQuoteData': {
    post: {
      summary: '获取引用数据',
      description: '获取数据详情用于展示引用，支持直接访问或通过对话鉴权',
      tags: [TagsMap.datasetData],
      requestBody: {
        content: {
          'application/json': {
            schema: GetQuoteDataBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回引用数据和所属集合信息'
        }
      }
    }
  },
  '/core/dataset/data/insertData': {
    post: {
      summary: '插入单条数据',
      description: '立即插入一条数据到数据集并生成向量索引',
      tags: [TagsMap.datasetData],
      requestBody: {
        content: {
          'application/json': {
            schema: InsertDataBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回新数据的 ID'
        }
      }
    }
  },
  '/core/dataset/data/insertImages': {
    post: {
      summary: '插入图片',
      description: '上传图片文件并推送到训练队列（multipart/form-data）',
      tags: [TagsMap.datasetData],
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: InsertImagesBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '上传成功，图片已加入训练队列'
        }
      }
    }
  },
  '/core/dataset/data/pushData': {
    post: {
      summary: '推送数据到训练队列',
      description: '批量推送数据到训练队列，最多 200 条',
      tags: [TagsMap.datasetData],
      requestBody: {
        content: {
          'application/json': {
            schema: PushDataBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回插入条数'
        }
      }
    }
  }
};
