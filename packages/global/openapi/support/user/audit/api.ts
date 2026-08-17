import z from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { SourceMemberSchema } from '../../../../support/user/type';
import { AuditEventEnum } from '../../../../support/user/audit/constants';
import { UserPaginationBodySchema } from '../api';

/* ============================================================================
 * API: 获取团队操作日志
 * Route: POST /api/proApi/support/user/audit/list
 * Method: POST
 * Description: 分页查询当前团队的成员和应用等操作日志。
 * Tags: ['团队管理', 'Read']
 * ============================================================================ */

export const AuditListBodySchema = UserPaginationBodySchema.extend({
  tmbIds: z
    .array(ObjectIdSchema)
    .optional()
    .meta({
      example: ['68ad85a7463006c963799a05'],
      description: '按团队成员 ID 筛选'
    }),
  events: z
    .array(z.enum(AuditEventEnum))
    .optional()
    .meta({
      example: [AuditEventEnum.UPDATE_APP_INFO],
      description: '按操作事件类型筛选'
    })
}).meta({
  description: '团队操作日志筛选和分页参数'
});
export type AuditListBodyType = z.infer<typeof AuditListBodySchema>;

export const AuditListItemSchema = z
  .object({
    _id: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a10',
      description: '操作日志 ID'
    }),
    sourceMember: SourceMemberSchema.meta({
      description: '发起操作的团队成员'
    }),
    event: z.enum(AuditEventEnum).meta({
      example: AuditEventEnum.UPDATE_APP_INFO,
      description: '操作事件类型'
    }),
    timestamp: z.coerce.date().meta({
      example: '2026-01-02T00:00:00.000Z',
      description: '操作发生时间'
    }),
    metadata: z
      .record(
        z.string(),
        z.union([z.string(), z.array(z.string())]).meta({
          description: '操作附加信息值，支持字符串或字符串数组'
        })
      )
      .meta({
        example: {
          name: '张三'
        },
        description: '操作附加信息'
      })
  })
  .meta({
    description: '团队操作日志'
  });

export const AuditListResponseSchema = z.object({
  list: z.array(AuditListItemSchema).meta({
    description: '操作日志列表'
  }),
  total: z.number().meta({
    example: 100,
    description: '操作日志总数'
  })
});
export type AuditListResponseType = z.infer<typeof AuditListResponseSchema>;
