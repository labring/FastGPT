import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import {
  UpdateSystemModelBodySchema,
  UpdateSystemModelResponseSchema,
  UpdateSystemModelsWithJsonBodySchema,
  UpdateSystemModelsWithJsonResponseSchema
} from './api';

export const AdminSystemModelPath: OpenAPIPath = {
  '/core/ai/model/update': {
    put: {
      summary: '更新系统模型配置',
      description: '合并并严格校验指定系统模型的配置',
      tags: [DevApiTagsMap.adminSettings],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateSystemModelBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '更新成功',
          content: {
            'application/json': {
              schema: UpdateSystemModelResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/ai/model/updateWithJson': {
    put: {
      summary: '导入系统模型配置',
      description: '严格校验 JSON 内容后覆盖系统模型配置',
      tags: [DevApiTagsMap.adminSettings],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateSystemModelsWithJsonBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '导入成功',
          content: {
            'application/json': {
              schema: UpdateSystemModelsWithJsonResponseSchema
            }
          }
        }
      }
    }
  }
};
