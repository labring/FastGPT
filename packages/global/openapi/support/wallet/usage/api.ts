import z from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { DateSchema, IntSchema, NumSchema } from '../../../../common/zod';
import { UsageSourceEnum } from '../../../../support/wallet/usage/constants';
import { PaginationResponseSchema, createPaginationSchema } from '../../../api';
import {
  UsageCommonFiltersSchema,
  UsageSubjectFilterSchema,
  UsageFilterContextSchema,
  UsageFilterOptionSchema,
  UsageSourceMemberSchema
} from '../../../../support/wallet/usage/filter';

/* ============================================================================
 * API: 钱包使用记录
 * Route: /api/proApi/support/wallet/usage/*
 * Method: POST
 * Description: 查询团队积分使用明细、趋势统计并导出使用记录。
 * Tags: ['使用记录']
 * ============================================================================ */

const noMixedSubjectFilter = (value: { subjectFilter?: unknown; teamMemberIds?: unknown }) =>
  value.subjectFilter === undefined || value.teamMemberIds === undefined;
const noMixedSubjectFilterError = {
  path: ['teamMemberIds'],
  message: 'Cannot mix subjectFilter and teamMemberIds'
};

const UsageFilterSchema = UsageCommonFiltersSchema.extend({
  teamMemberIds: z
    .array(ObjectIdSchema)
    .optional()
    .meta({
      example: ['68ee0bd23d17260b7829b137'],
      description: '团队成员 ID 筛选',
      deprecated: true
    }),
  subjectFilter: UsageSubjectFilterSchema.optional().meta({
    description: '按成员、部门或群组互斥筛选，不能与旧成员参数混传'
  }),
  expectedScope: z
    .enum(['team', 'self'])
    .optional()
    .meta({ description: '上次页面授权范围，用于检测权限变化' })
}).meta({ description: '使用记录筛选参数' });

const UsageItemSchema = z
  .object({
    moduleName: z.string().meta({ example: 'AI 对话', description: '消耗模块名称' }),
    amount: NumSchema.meta({ example: 10.5, description: '该模块消耗的积分' }),
    modelId: z.string().optional().meta({ description: '模型 ID' }),
    model: z.string().optional().meta({
      example: 'gpt-4o-mini',
      description: '模型展示名称；旧记录为历史模型标识',
      deprecated: true
    }),
    inputTokens: IntSchema.optional().meta({ example: 1200, description: '输入 token 数' }),
    outputTokens: IntSchema.optional().meta({ example: 800, description: '输出 token 数' }),
    totalTokens: IntSchema.optional().meta({
      example: 77,
      description: 'STT 按 Tokens 计费的总用量'
    }),
    charsLength: IntSchema.optional().meta({ example: 2400, description: '文本字符数' }),
    duration: NumSchema.optional().meta({
      example: 1.2,
      description: '时长（秒）；STT 为实际计费的音频时长'
    }),
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
    sourceMember: UsageSourceMemberSchema.meta({ description: '产生使用记录的团队成员' })
  })
  .meta({ description: '使用记录' });
export type UsageListItemResponseType = z.infer<typeof UsageListItemSchema>;

export const GetUsageBodySchema = createPaginationSchema(UsageFilterSchema.shape)
  .refine(noMixedSubjectFilter, noMixedSubjectFilterError)
  .meta({
    description: '使用明细筛选和分页参数'
  });
export type GetUsageBodyType = z.infer<typeof GetUsageBodySchema>;
export const GetUsageResponseSchema = PaginationResponseSchema(UsageListItemSchema)
  .extend({
    context: UsageFilterContextSchema.optional().meta({ description: '最新筛选上下文' })
  })
  .meta({
    description: '使用明细分页列表'
  });
export type GetUsageResponseType = z.infer<typeof GetUsageResponseSchema>;

export const GetUsageDashboardBodySchema = UsageFilterSchema.extend({
  dateStart: DateSchema.meta({
    example: '2026-01-01T00:00:00+08:00',
    description: '统计开始时间（包含），按自带偏移解释；无偏移时按服务器时区'
  }),
  dateEnd: DateSchema.meta({
    example: '2026-01-08T00:00:00+08:00',
    description: '统计结束时间（包含），按自带偏移解释；无偏移时按服务器时区'
  }),
  unit: z.enum(['day', 'month']).meta({ example: 'day', description: '统计粒度' })
})
  .refine(noMixedSubjectFilter, noMixedSubjectFilterError)
  .meta({ description: '使用趋势统计参数' });
export type GetUsageDashboardBodyType = z.infer<typeof GetUsageDashboardBodySchema>;

export const GetUsageDashboardResponseItemSchema = z
  .object({
    date: z.coerce.date().meta({ example: '2026-01-01T00:00:00.000Z', description: '统计日期' }),
    totalPoints: NumSchema.meta({ example: 100.5, description: '当天总积分消耗' })
  })
  .meta({ description: '使用趋势统计项' });
const UsageDashboardListSchema = z.array(GetUsageDashboardResponseItemSchema).meta({
  description: '使用趋势统计列表'
});
export const GetUsageDashboardResponseSchema = z
  .union([
    z
      .object({
        list: UsageDashboardListSchema,
        context: UsageFilterContextSchema.meta({ description: '最新筛选上下文' })
      })
      .meta({ description: '使用趋势统计结果与最新筛选上下文' }),
    UsageDashboardListSchema
  ])
  .meta({
    description: '传入 subjectFilter 时返回统计列表与筛选上下文；旧调用保持统计数组结构'
  });
export type GetUsageDashboardResponseType = z.infer<typeof GetUsageDashboardResponseSchema>;

export const ExportUsageBodySchema = UsageFilterSchema.extend({
  dateStart: DateSchema.meta({
    example: '2026-01-01T00:00:00+08:00',
    description: '导出开始时间（包含），按自带偏移解释；无偏移时按服务器时区'
  }),
  dateEnd: DateSchema.meta({
    example: '2026-01-08T00:00:00+08:00',
    description: '导出结束时间（包含），按自带偏移解释；无偏移时按服务器时区'
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
})
  .refine(noMixedSubjectFilter, noMixedSubjectFilterError)
  .meta({ description: '使用记录导出参数' });
export type ExportUsageBodyType = z.infer<typeof ExportUsageBodySchema>;

export const ExportUsageContentSchema = z.string().meta({
  description: '使用记录 CSV 文件内容'
});

export const UsageFilterOptionsBodySchema = z.strictObject({
  intent: z.enum(['options', 'validate']).default('options').meta({
    description: 'options 读取候选项；validate 仅校验权限与已选范围'
  }),
  subjectFilter: UsageSubjectFilterSchema.meta({ description: '当前选择意图' }),
  expectedScope: z.enum(['team', 'self']).default('team').meta({ description: '期望授权范围' }),
  searchKey: z.string().optional().meta({ description: '当前类型的搜索关键词' }),
  pagination: createPaginationSchema().optional().meta({ description: '选项分页' }),
  departmentDirectoryId: z
    .union([ObjectIdSchema, z.literal('')])
    .optional()
    .meta({ description: '当前部门目录，空字符串表示根' })
});
export type UsageFilterOptionsBody = z.input<typeof UsageFilterOptionsBodySchema>;

export const UsageFilterOptionsResponseSchema = z.object({
  context: UsageFilterContextSchema.meta({ description: '最新筛选上下文' }),
  options: z.array(UsageFilterOptionSchema).meta({ description: '当前页选项' }),
  total: IntSchema.meta({ description: '匹配选项总数' }),
  hasMore: z.boolean().meta({ description: '是否还有下一页' }),
  departmentDirectory: z
    .object({
      id: z.union([ObjectIdSchema, z.literal('')]).meta({ description: '目录 ID' }),
      name: z.string().meta({ description: '目录名称' })
    })
    .optional()
    .meta({ description: '校验后的当前目录' }),
  breadcrumbs: z
    .array(
      z.object({
        id: z.union([ObjectIdSchema, z.literal('')]).meta({ description: '路径节点 ID' }),
        name: z.string().meta({ description: '路径节点名称' })
      })
    )
    .meta({ description: '包含团队根的完整路径' })
});
export type UsageFilterOptionsResponse = z.infer<typeof UsageFilterOptionsResponseSchema>;
