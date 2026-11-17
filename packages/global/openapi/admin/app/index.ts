import type { OpenAPIPath } from '../../type';
import { DevApiTagsMap } from '../../tag';
import { GetAppsBodySchema, GetAppsResponseSchema } from './api';
import { AdminTemplatePath } from './templates';
import { AdminTemplateTypePath } from './templateType';

export const AdminAppsPath: OpenAPIPath = {
  ...AdminTemplatePath,
  ...AdminTemplateTypePath,
  '/proApi/admin/app/getApps': {
    post: {
      summary: '获取应用列表（路由层）',
      description:
        '分页获取应用列表，支持按创建者用户名、团队名称、应用名称模糊搜索及团队ID、应用ID精确搜索。',
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
