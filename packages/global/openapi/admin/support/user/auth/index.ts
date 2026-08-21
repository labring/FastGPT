import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import { AdminCertResponseSchema } from './api';

export const AdminAuthPath: OpenAPIPath = {
  '/admin/support/user/adminCert': {
    get: {
      summary: '管理员认证校验',
      description: '验证当前请求的管理员身份并返回管理员信息',
      tags: [DevApiTagsMap.adminAuth],
      responses: {
        200: {
          description: '认证成功，返回管理员信息',
          content: {
            'application/json': {
              schema: AdminCertResponseSchema
            }
          }
        }
      }
    }
  }
};
