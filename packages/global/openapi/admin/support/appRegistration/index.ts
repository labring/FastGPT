import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import { CreateAppRegistrationBodySchema, CreateAppRegistrationResponseSchema } from './api';

export const AdminAppRegistrationPath: OpenAPIPath = {
  '/admin/support/appRegistration/create': {
    post: {
      summary: '创建应用备案记录',
      description: '系统超级管理员为指定应用创建备案记录，校验团队备案配额并防止重复备案',
      tags: [DevApiTagsMap.adminApps],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: CreateAppRegistrationBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功创建应用备案记录',
          content: {
            'application/json': {
              schema: CreateAppRegistrationResponseSchema
            }
          }
        }
      }
    }
  }
};
