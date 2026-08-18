import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import { AuditListBodySchema, AuditListResponseSchema } from './api';

export const UserAuditPath: OpenAPIPath = {
  '/proApi/support/user/audit/list': {
    post: {
      summary: '获取团队操作日志',
      description: '分页查询当前团队的成员和应用等操作日志',
      tags: [DevApiTagsMap.teamManage],
      requestBody: {
        content: {
          'application/json': {
            schema: AuditListBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回团队操作日志',
          content: {
            'application/json': {
              schema: AuditListResponseSchema
            }
          }
        }
      }
    }
  }
};
