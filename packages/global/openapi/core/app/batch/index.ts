import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  BatchResourceActionResponseSchema,
  BatchResourceDeleteBodySchema,
  BatchResourceMoveBodySchema
} from '../../../common/batch/api';

export const AppBatchPath: OpenAPIPath = {
  '/core/app/batch/move': {
    post: {
      summary: '批量移动应用',
      description: '批量移动应用或文件夹，具体权限、目录深度和继承权限由应用模块校验',
      tags: [DevApiTagsMap.appCommon],
      requestBody: {
        content: {
          'application/json': {
            schema: BatchResourceMoveBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功移动应用',
          content: {
            'application/json': {
              schema: BatchResourceActionResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/batch/delete': {
    post: {
      summary: '批量删除应用',
      description: '批量删除应用或文件夹，具体子树处理和异步清理由应用模块负责',
      tags: [DevApiTagsMap.appCommon],
      requestBody: {
        content: {
          'application/json': {
            schema: BatchResourceDeleteBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功删除应用',
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
