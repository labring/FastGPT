import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  UpdateTrainingDataBodySchema,
  RebuildEmbeddingBodySchema,
  DeleteTrainingDataBodySchema,
  GetTrainingDataDetailBodySchema,
  GetTrainingErrorBodySchema,
  GetDatasetTrainingQueueQuerySchema
} from './api';

export const DatasetTrainingPath: OpenAPIPath = {
  '/core/dataset/training/updateTrainingData': {
    put: {
      summary: '更新训练数据',
      description: '更新单条训练数据，或批量重试集合内所有错误数据（不传 dataId）',
      tags: [TagsMap.datasetTraining],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateTrainingDataBodySchema
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

  '/core/dataset/training/rebuildEmbedding': {
    post: {
      summary: '重建数据集向量索引',
      description: '切换向量模型并重建知识库所有数据的向量索引，需要所有者权限',
      tags: [TagsMap.datasetTraining],
      requestBody: {
        content: {
          'application/json': {
            schema: RebuildEmbeddingBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '重建任务已启动'
        }
      }
    }
  },

  '/core/dataset/training/deleteTrainingData': {
    post: {
      summary: '删除训练数据',
      description: '删除指定的训练数据条目，需要管理权限',
      tags: [TagsMap.datasetTraining],
      requestBody: {
        content: {
          'application/json': {
            schema: DeleteTrainingDataBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '删除成功'
        }
      }
    }
  },

  '/core/dataset/training/getTrainingDataDetail': {
    post: {
      summary: '获取训练数据详情',
      description: '获取单条训练数据的详细信息，包括图片预览 URL',
      tags: [TagsMap.datasetTraining],
      requestBody: {
        content: {
          'application/json': {
            schema: GetTrainingDataDetailBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回训练数据详情，数据不存在时返回空'
        }
      }
    }
  },

  '/core/dataset/training/getTrainingError': {
    post: {
      summary: '获取训练错误列表',
      description: '分页查询集合内训练失败的数据列表',
      tags: [TagsMap.datasetTraining],
      requestBody: {
        content: {
          'application/json': {
            schema: GetTrainingErrorBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回错误数据分页列表'
        }
      }
    }
  },

  '/core/dataset/training/getDatasetTrainingQueue': {
    get: {
      summary: '获取训练队列状态',
      description: '获取知识库当前的重建数量和训练队列数量',
      tags: [TagsMap.datasetTraining],
      requestParams: {
        query: GetDatasetTrainingQueueQuerySchema
      },
      responses: {
        200: {
          description: '成功返回重建数量和训练队列数量'
        }
      }
    }
  }
};
