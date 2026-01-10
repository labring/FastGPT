import type { OpenAPIPath } from '../../../type';
import { GetAppsBodySchema, GetAppsResponseSchema } from './api';
import { TagsMap } from '../../../tag';

export const AdminAppPath: OpenAPIPath = {
  '/admin/core/app/getApps': {
    post: {
      summary: '获取应用列表',
      description: '分页获取应用列表，支持按名称和ID搜索',
      tags: [TagsMap.adminApps],
      requestBody: {
        content: {
          'application/json': {
            schema: GetAppsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取应用列表',
          content: {
            'application/json': {
              schema: GetAppsResponseSchema
            }
          }
        }
      }
    }
  }
};
