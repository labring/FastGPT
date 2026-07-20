import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import { TeamAuditListBodySchema, TeamAuditListResponseSchema } from './api';

export const UserAuditPath: OpenAPIPath = {
  '/proApi/support/user/audit/list': {
    post: {
      summary: '获取团队审计日志',
      description: '分页获取当前团队的团队事件审计日志',
      tags: [DevApiTagsMap.teamManage],
      requestBody: {
        content: { 'application/json': { schema: TeamAuditListBodySchema } }
      },
      responses: {
        200: {
          description: '团队审计日志列表',
          content: { 'application/json': { schema: TeamAuditListResponseSchema } }
        }
      }
    }
  }
};
