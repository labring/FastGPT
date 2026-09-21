import z from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { SourceMemberSchema } from '../../../../support/user/type';
import { AdminAuditEventEnum } from '../../../../support/user/audit/constants';
import { PaginationSchema } from '../../../api';

/* ============================================================================
 * API: 获取管理员审计日志
 * Route: POST /api/proApi/admin/system/audit/list
 * Method: POST
 * Description: 分页查询管理员操作日志。
 * Tags: ['审计日志']
 * ============================================================================ */

export const AdminAuditListBodySchema = PaginationSchema.extend({
  tmbIds: z
    .array(ObjectIdSchema)
    .optional()
    .meta({
      example: ['68ad85a7463006c963799a05'],
      description: '按团队成员 ID 筛选'
    }),
  events: z
    .array(z.enum(AdminAuditEventEnum))
    .optional()
    .meta({
      example: [AdminAuditEventEnum.ADMIN_LOGIN],
      description: '按管理员操作事件类型筛选'
    })
}).meta({ description: '管理员审计日志筛选和分页参数' });
export type AdminAuditListBodyType = z.infer<typeof AdminAuditListBodySchema>;

const AdminAuditMetadataValueSchema = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString() : value),
  z.union([z.string(), ObjectIdSchema, z.array(z.union([z.string(), ObjectIdSchema]))])
);

export const AdminAuditListItemSchema = z
  .object({
    _id: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a10',
      description: '操作日志 ID'
    }),
    sourceMember: SourceMemberSchema.meta({ description: '发起操作的管理员成员' }),
    event: z.enum(AdminAuditEventEnum).meta({
      example: AdminAuditEventEnum.ADMIN_LOGIN,
      description: '管理员操作事件类型'
    }),
    timestamp: z.coerce.date().meta({
      example: '2026-01-02T00:00:00.000Z',
      description: '操作发生时间'
    }),
    metadata: z
      .record(
        z.string(),
        AdminAuditMetadataValueSchema.meta({
          description: '操作附加信息值，支持字符串、ObjectId 或数组'
        })
      )
      .meta({ example: { name: '张三' }, description: '操作附加信息' })
  })
  .meta({ description: '管理员审计日志' });
export type AdminAuditListItemType = z.infer<typeof AdminAuditListItemSchema>;

export const AdminAuditListResponseSchema = z.object({
  list: z.array(AdminAuditListItemSchema).meta({ description: '审计日志列表' }),
  total: z.number().meta({ example: 100, description: '审计日志总数' })
});
export type AdminAuditListResponseType = z.infer<typeof AdminAuditListResponseSchema>;
