import { PaginationResponseSchema, PaginationSchema } from '../../../api';
import { AuditEventEnum } from '../../../../support/user/audit/constants';
import { SourceMemberSchema } from '../../../../support/user/type';
import { z } from 'zod';

/* ============================================================================
 * API: 获取团队审计日志
 * Route: POST /proApi/support/user/audit/list
 * Method: POST
 * Description: 分页获取当前团队的团队事件审计日志
 * Tags: ['团队管理']
 * ============================================================================ */

export const TeamAuditListBodySchema = PaginationSchema.extend({
  tmbIds: z.array(z.string()).optional().meta({ description: '成员 ID 筛选' }),
  events: z.array(z.enum(AuditEventEnum)).optional().meta({ description: '团队审计事件筛选' })
}).strict();
export type TeamAuditListBody = z.infer<typeof TeamAuditListBodySchema>;

export const TeamAuditListItemSchema = z.object({
  _id: z.string().meta({ description: '审计日志 ID' }),
  sourceMember: SourceMemberSchema.meta({ description: '操作成员' }),
  event: z.enum(AuditEventEnum).meta({ description: '团队审计事件' }),
  timestamp: z.date().meta({ description: '操作时间' }),
  metadata: z.record(z.string(), z.any()).meta({ description: '事件元数据' })
});

export const TeamAuditListResponseSchema = PaginationResponseSchema(TeamAuditListItemSchema);
