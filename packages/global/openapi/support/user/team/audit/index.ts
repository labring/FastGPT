import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import {
  AuditListBodySchema,
  AuditListResponseSchema,
  AuditExportBodySchema,
  AuditExportResponseSchema
} from './api';

export const TeamAuditPath: OpenAPIPath = {
  '/proApi/support/user/team/audit/export': {
    post: {
      summary: '导出团队审计日志',
      description:
        '要求团队管理权限及有效审计套餐。导出全部匹配记录，最多 50,000 条；超量拒绝，不按分页截断。记录一次发起导出动作。',
      tags: [DevApiTagsMap.teamManage],
      requestBody: { content: { 'application/json': { schema: AuditExportBodySchema } } },
      responses: {
        200: {
          description: 'UTF-8 BOM CSV 文件流',
          content: { 'text/csv': { schema: AuditExportResponseSchema } }
        },
        400: { description: '无匹配记录或超过 50,000 条，请调整筛选范围' }
      }
    }
  },
  '/proApi/support/user/team/audit/list': {
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
