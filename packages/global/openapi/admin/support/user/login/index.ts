import type { OpenAPIPath } from '../../../../type';
import { AdminLoginBodySchema, AdminLoginResponseSchema } from './api';
import { TagsMap } from '../../../../tag';

export const AdminLoginPath: OpenAPIPath = {
  '/admin/support/user/login': {
    post: {
      summary: '管理员登录',
      description: '管理员使用用户名和密码登录',
      tags: [TagsMap.userLogin],
      requestBody: {
        content: {
          'application/json': {
            schema: AdminLoginBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '登录成功',
          content: {
            'application/json': {
              schema: AdminLoginResponseSchema
            }
          }
        }
      }
    }
  }
};
