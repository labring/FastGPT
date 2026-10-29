import z from 'zod';
import { ObjectIdSchema } from '../../../../../common/type/mongo';
import { SourceMemberSchema } from '../../../../../support/user/type';
import { AuditEventEnum, TeamAuditEventList } from '../../../../../support/user/audit/constants';
import { createPaginationSchema } from '../../../../api';
import { LanguageSchema } from '../../../../../common/i18n/type';
import { getTimezoneCodeFromStr } from '../../../../../common/time/timezone';
import dayjs from 'dayjs';

/* ============================================================================
 * API: 获取团队操作日志
 * Route: POST /api/proApi/support/user/team/audit/list
 * Method: POST
 * Description: 分页查询当前团队的成员和应用等操作日志。
 * Tags: ['团队管理', 'Read']
 * ============================================================================ */

export const AuditFilterSchema = z
  .object({
    dateStart: z.string().datetime({ offset: true }).meta({
      example: '2026-01-01T00:00:00.000+08:00',
      description: '操作时间起点（包含），使用浏览器本地日的零点'
    }),
    dateEnd: z.string().datetime({ offset: true }).meta({
      example: '2026-01-07T23:59:59.999+08:00',
      description: '操作时间终点（包含），使用浏览器本地日的最后一毫秒'
    }),
    tmbIds: z
      .array(ObjectIdSchema)
      .optional()
      .meta({
        example: ['68ad85a7463006c963799a05'],
        description: '按团队成员 ID 筛选'
      }),
    events: z
      .array(z.enum(TeamAuditEventList))
      .optional()
      .meta({
        example: [AuditEventEnum.UPDATE_APP_INFO],
        description: '按操作事件类型筛选'
      })
  })
  .meta({
    description: '列表与导出共用的团队审计筛选条件；省略成员或事件表示全部，空数组表示未选择'
  });
export type AuditFilterType = z.infer<typeof AuditFilterSchema>;

/** 统一校验时间顺序，并按 dateEnd 的固定 UTC offset 允许查询到今天结束。 */
const validateAuditRange = (data: AuditFilterType, ctx: z.RefinementCtx) => {
  const start = new Date(data.dateStart);
  const end = new Date(data.dateEnd);
  if (start > end) {
    ctx.addIssue({ code: 'custom', path: ['dateEnd'], message: 'Start must not be after end' });
  }
  // 跨夏令时时首尾 offset 可能不同，使用结束日的 offset，避免当天上限偏移一小时。
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return;
  const todayEnd = dayjs().utcOffset(getTimezoneCodeFromStr(data.dateEnd)).endOf('day');
  if (end.getTime() > todayEnd.valueOf()) {
    ctx.addIssue({ code: 'custom', path: ['dateEnd'], message: 'Future dates are not allowed' });
  }
};

export const AuditListBodySchema = createPaginationSchema(AuditFilterSchema.shape)
  .superRefine(validateAuditRange)
  .meta({ description: '团队操作日志筛选和分页参数' });
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
    event: z.enum(TeamAuditEventList).meta({
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
        z.preprocess(
          (value) => (value instanceof Date ? value.toISOString() : value),
          z.union([z.string(), z.array(z.string())]).meta({
            description: '操作附加信息值，支持字符串或字符串数组'
          })
        )
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

/* ============================================================================
 * API: 导出团队审计日志
 * Route: POST /api/proApi/support/user/team/audit/export
 * Method: POST
 * Description: 按当前筛选导出最多 50,000 条日志，超量拒绝，分页不影响导出。
 * Tags: ['团队管理']
 * ============================================================================ */
export const AuditExportBodySchema = AuditFilterSchema.extend({
  locale: LanguageSchema.meta({ example: 'zh-CN', description: 'CSV 表头、事件和详情的语言' })
}).superRefine(validateAuditRange);
export type AuditExportBodyType = z.infer<typeof AuditExportBodySchema>;
export const AuditExportResponseSchema = z.string().meta({
  description: '带 UTF-8 BOM 的 CSV 文件流',
  example: '\uFEFF操作人员,操作时间,操作类型,详情'
});
export type AuditExportResponseType = z.infer<typeof AuditExportResponseSchema>;
