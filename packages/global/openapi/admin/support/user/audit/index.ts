import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import { AdminAuditListBodySchema, AdminAuditListResponseSchema } from './api';

export const AdminAuditPath: OpenAPIPath = {
  '/support/user/audit/adminList': {
    post: {
      summary: '获取管理员审计日志',
      description: '分页获取当前团队的管理员事件审计日志',
      tags: [DevApiTagsMap.adminLogs],
      requestBody: {
        content: { 'application/json': { schema: AdminAuditListBodySchema } }
      },
      responses: {
        200: {
          description: '管理员审计日志列表',
          content: { 'application/json': { schema: AdminAuditListResponseSchema } }
        }
      }
    }
  }
};
