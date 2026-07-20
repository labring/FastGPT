import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import { GetAppsBodySchema, GetAppsResponseSchema } from '../../core/app/api';

export const AdminRoutesAppsPath: OpenAPIPath = {
  '/admin/routes/apps/getApps': {
    post: {
      summary: '获取应用列表（路由层）',
      description:
        '分页获取应用列表，支持按名称和应用ID搜索。复用与 core/app/getApps 相同的 schema',
      tags: [DevApiTagsMap.adminApps],
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
