import { PaginationResponseSchema, PaginationSchema } from '../../../../api';
import { AdminAuditEventEnum } from '../../../../../support/user/audit/constants';
import { SourceMemberSchema } from '../../../../../support/user/type';
import { z } from 'zod';

/* ============================================================================
 * API: 获取管理员审计日志
 * Route: POST /api/support/user/audit/adminList
 * Method: POST
 * Description: 分页获取当前团队的管理员事件审计日志
 * Tags: ['系统日志']
 * ============================================================================ */

export const AdminAuditListBodySchema = PaginationSchema.extend({
  tmbIds: z.array(z.string()).optional().meta({ description: '成员 ID 筛选' }),
  events: z
    .array(z.enum(AdminAuditEventEnum))
    .optional()
    .meta({ description: '管理员审计事件筛选' })
}).strict();
export type AdminAuditListBody = z.infer<typeof AdminAuditListBodySchema>;

export const AdminAuditListItemSchema = z.object({
  _id: z.string().meta({ description: '审计日志 ID' }),
  sourceMember: SourceMemberSchema.meta({ description: '操作成员' }),
  event: z.enum(AdminAuditEventEnum).meta({ description: '管理员审计事件' }),
  timestamp: z.date().meta({ description: '操作时间' }),
  metadata: z.record(z.string(), z.any()).meta({ description: '事件元数据' })
});

export const AdminAuditListResponseSchema = PaginationResponseSchema(AdminAuditListItemSchema);
