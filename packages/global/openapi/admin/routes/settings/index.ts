import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import { GetConfigResponseSchema, UpdateConfigBodySchema } from './api';

export const AdminSettingsPath: OpenAPIPath = {
  '/admin/routes/settings/getConfig': {
    get: {
      summary: '获取系统配置',
      description: '获取 FastGPT 和 FastGPT Pro 的当前系统配置',
      tags: [DevApiTagsMap.adminSettings],
      responses: {
        200: {
          description: '成功获取系统配置',
          content: {
            'application/json': {
              schema: GetConfigResponseSchema
            }
          }
        }
      }
    }
  },
  '/admin/routes/settings/updateConfig': {
    post: {
      summary: '更新系统配置',
      description: '更新 FastGPT 和 FastGPT Pro 的系统配置',
      tags: [DevApiTagsMap.adminSettings],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateConfigBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '更新成功',
          content: {
            'application/json': {
              schema: {}
            }
          }
        }
      }
    }
  }
};
