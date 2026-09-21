import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import { AdminAuditListBodySchema, AdminAuditListResponseSchema } from './api';

export const AdminAuditPath: OpenAPIPath = {
  '/proApi/admin/system/audit/list': {
    post: {
      summary: '获取管理员审计日志',
      description: '分页查询管理员用户、团队、套餐、系统配置等操作日志',
      tags: [DevApiTagsMap.adminAudit],
      requestBody: {
        content: {
          'application/json': {
            schema: AdminAuditListBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回管理员审计日志',
          content: {
            'application/json': {
              schema: AdminAuditListResponseSchema
            }
          }
        }
      }
    }
  }
};
