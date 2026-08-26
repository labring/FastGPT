import z from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { IntSchema, NumSchema } from '../../../../common/zod';
import { UsageSourceEnum } from '../../../../support/wallet/usage/constants';
import { SourceMemberSchema } from '../../../../support/user/type';
import { PaginationResponseSchema, PaginationSchema } from '../../../api';

/* ============================================================================
 * API: 钱包使用记录
 * Route: /api/proApi/support/wallet/usage/*
 * Method: POST
 * Description: 查询团队积分使用明细、趋势统计并导出使用记录。
 * Tags: ['使用记录']
 * ============================================================================ */

const UsageDateSchema = z.string().datetime({ offset: true });

const UsageFilterSchema = z
  .object({
    dateStart: UsageDateSchema.optional().meta({
      example: '2026-01-01T00:00:00+08:00',
      description: '查询开始时间'
    }),
    dateEnd: UsageDateSchema.optional().meta({
      example: '2026-01-08T00:00:00+08:00',
      description: '查询结束时间'
    }),
    sources: z
      .array(z.enum(UsageSourceEnum))
      .optional()
      .meta({
        example: [UsageSourceEnum.fastgpt, UsageSourceEnum.api],
        description: '使用来源筛选'
      }),
    teamMemberIds: z
      .array(ObjectIdSchema)
      .optional()
      .meta({
        example: ['68ee0bd23d17260b7829b137'],
        description: '团队成员 ID 筛选'
      }),
    projectName: z.string().optional().meta({ example: '客服助手', description: '应用名称筛选' })
  })
  .meta({ description: '使用记录筛选参数' });

const UsageItemSchema = z
  .object({
    moduleName: z.string().meta({ example: 'AI 对话', description: '消耗模块名称' }),
    amount: NumSchema.meta({ example: 10.5, description: '该模块消耗的积分' }),
    modelId: ObjectIdSchema.optional().meta({ description: '模型 ID' }),
    model: z.string().optional().meta({
      example: 'gpt-4o-mini',
      description: '模型展示名称；旧记录为历史模型标识',
      deprecated: true
    }),
    inputTokens: IntSchema.optional().meta({ example: 1200, description: '输入 token 数' }),
    outputTokens: IntSchema.optional().meta({ example: 800, description: '输出 token 数' }),
    charsLength: IntSchema.optional().meta({ example: 2400, description: '文本字符数' }),
    duration: NumSchema.optional().meta({ example: 1.2, description: '处理耗时' }),
    pages: IntSchema.optional().meta({ example: 3, description: '处理页数' }),
    count: IntSchema.optional().meta({ example: 1, description: '处理次数' }),
    tokens: IntSchema.optional().meta({ description: '旧版 token 统计字段', deprecated: true })
  })
  .meta({ description: '单条使用明细' });
export type UsageItemResponseType = z.infer<typeof UsageItemSchema>;

export const UsageListItemSchema = z
  .object({
    id: ObjectIdSchema.meta({ example: '68ee0bd23d17260b7829b139', description: '使用记录 ID' }),
    time: z.coerce.date().meta({
      example: '2026-01-01T08:00:00.000Z',
      description: '使用时间'
    }),
    appName: z.string().meta({ example: '客服助手', description: '应用名称' }),
    source: z
      .enum(UsageSourceEnum)
      .meta({ example: UsageSourceEnum.fastgpt, description: '使用来源' }),
    totalPoints: NumSchema.meta({ example: 10.5, description: '本条记录总积分消耗' }),
    list: z.array(UsageItemSchema).meta({ description: '使用明细列表' }),
    sourceMember: SourceMemberSchema.meta({ description: '产生使用记录的团队成员' })
  })
  .meta({ description: '使用记录' });
export type UsageListItemResponseType = z.infer<typeof UsageListItemSchema>;

export const GetUsageBodySchema = PaginationSchema.extend(UsageFilterSchema.shape).meta({
  description: '使用明细筛选和分页参数'
});
export type GetUsageBodyType = z.infer<typeof GetUsageBodySchema>;
export const GetUsageResponseSchema = PaginationResponseSchema(UsageListItemSchema).meta({
  description: '使用明细分页列表'
});
export type GetUsageResponseType = z.infer<typeof GetUsageResponseSchema>;

export const GetUsageDashboardBodySchema = UsageFilterSchema.extend({
  dateStart: UsageDateSchema.meta({
    example: '2026-01-01T00:00:00+08:00',
    description: '统计开始时间'
  }),
  dateEnd: UsageDateSchema.meta({
    example: '2026-01-08T00:00:00+08:00',
    description: '统计结束时间'
  }),
  unit: z.enum(['day', 'month']).meta({ example: 'day', description: '统计粒度' })
}).meta({ description: '使用趋势统计参数' });
export type GetUsageDashboardBodyType = z.infer<typeof GetUsageDashboardBodySchema>;

export const GetUsageDashboardResponseItemSchema = z
  .object({
    date: z.coerce.date().meta({ example: '2026-01-01T00:00:00.000Z', description: '统计日期' }),
    totalPoints: NumSchema.meta({ example: 100.5, description: '当天总积分消耗' })
  })
  .meta({ description: '使用趋势统计项' });
export const GetUsageDashboardResponseSchema = z.array(GetUsageDashboardResponseItemSchema).meta({
  description: '使用趋势统计列表'
});
export type GetUsageDashboardResponseType = z.infer<typeof GetUsageDashboardResponseSchema>;

export const ExportUsageBodySchema = UsageFilterSchema.extend({
  dateStart: UsageDateSchema.meta({
    example: '2026-01-01T00:00:00+08:00',
    description: '导出开始时间'
  }),
  dateEnd: UsageDateSchema.meta({
    example: '2026-01-08T00:00:00+08:00',
    description: '导出结束时间'
  }),
  appNameMap: z.record(z.string(), z.string()).meta({
    example: { 'core.app.Question Guide': '问题引导' },
    description: '应用名称翻译映射'
  }),
  sourcesMap: z.record(z.string(), z.object({ label: z.string() })).meta({
    example: { fastgpt: { label: '在线对话' } },
    description: '使用来源翻译映射'
  }),
  title: z.string().meta({ example: '时间,成员,来源,应用,积分', description: 'CSV 文件表头' })
}).meta({ description: '使用记录导出参数' });
export type ExportUsageBodyType = z.infer<typeof ExportUsageBodySchema>;

export const ExportUsageContentSchema = z.string().meta({
  description: '使用记录 CSV 文件内容'
});
