import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap, SystemOpenApiTagMap } from '../../../tag';
import {
  BatchResourceActionResponseSchema,
  BatchResourceDeleteBodySchema,
  BatchResourceMoveBodySchema
} from '../../../common/batch/api';

export const DatasetBatchPath: OpenAPIPath = {
  '/core/dataset/batch/move': {
    post: {
      summary: '批量移动知识库',
      description: '批量移动知识库或文件夹，具体权限、目录深度和继承权限由知识库模块校验',
      tags: [DevApiTagsMap.datasetCommon, SystemOpenApiTagMap.dataset],
      requestBody: {
        content: {
          'application/json': {
            schema: BatchResourceMoveBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功移动知识库',
          content: {
            'application/json': {
              schema: BatchResourceActionResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/dataset/batch/delete': {
    post: {
      summary: '批量删除知识库',
      description: '批量删除知识库或文件夹，具体子树处理和异步清理由知识库模块负责',
      tags: [DevApiTagsMap.datasetCommon, SystemOpenApiTagMap.dataset],
      requestBody: {
        content: {
          'application/json': {
            schema: BatchResourceDeleteBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功删除知识库',
          content: {
            'application/json': {
              schema: BatchResourceActionResponseSchema
            }
          }
        }
      }
    }
  }
};
