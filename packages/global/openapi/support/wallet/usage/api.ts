import z from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { IntSchema, NumSchema } from '../../../../common/zod';
import { UsageSourceEnum } from '../../../../support/wallet/usage/constants';
import { PaginationResponseSchema, createPaginationSchema } from '../../../api';
import {
  UsageSubjectFilterSchema,
  UsageCommonFiltersSchema,
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
    subjectFilter: UsageSubjectFilterSchema.optional().meta({
      description: '互斥主体筛选，不能与旧成员参数混传'
    }),
    projectName: z.string().optional().meta({ example: '客服助手', description: '应用名称筛选' })
  })
  .meta({ description: '使用记录筛选参数' });

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
    sourceMember: UsageSourceMemberSchema.meta({ description: '产生使用记录的团队成员' })
  })
  .meta({ description: '使用记录' });
export type UsageListItemResponseType = z.infer<typeof UsageListItemSchema>;

export const GetUsageBodySchema = createPaginationSchema(UsageFilterSchema.shape)
  .refine((value) => value.subjectFilter === undefined || value.teamMemberIds === undefined, {
    path: ['teamMemberIds'],
    message: 'Cannot mix subjectFilter and teamMemberIds'
  })
  .meta({
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
})
  .refine((value) => value.subjectFilter === undefined || value.teamMemberIds === undefined, {
    path: ['teamMemberIds'],
    message: 'Cannot mix subjectFilter and teamMemberIds'
  })
  .meta({ description: '使用趋势统计参数' });
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
  expectedScope: z
    .enum(['team', 'self'])
    .optional()
    .meta({ description: '上次页面授权范围，新协议必传' }),
  requestKey: z.string().min(1).optional().meta({ description: '操作标识，新协议必传' }),
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
})
  .superRefine((value, ctx) => {
    if (value.subjectFilter !== undefined) {
      if (value.teamMemberIds !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['teamMemberIds'],
          message: 'Cannot mix selection protocols'
        });
      }
      for (const key of ['expectedScope', 'requestKey'] as const) {
        if (value[key] === undefined)
          ctx.addIssue({ code: 'custom', path: [key], message: 'Required for subjectFilter' });
      }
    }
    if (Date.parse(value.dateStart) > Date.parse(value.dateEnd)) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateEnd'],
        message: 'End date must not precede start date'
      });
    }
  })
  .meta({ description: '使用记录导出参数' });
export type ExportUsageBodyType = z.infer<typeof ExportUsageBodySchema>;

export const ExportUsageContentSchema = z.string().meta({
  description: '使用记录 CSV 文件内容'
});

/* API: 使用记录统一查询与筛选选项
 * Route: POST /api/proApi/support/wallet/usage/{query,filterOptions}
 * Method: POST
 * Description: 按当前权限和组织关系查询，并返回标准化筛选上下文。
 * Tags: ['使用记录']
 */
const UsageOperationShape = {
  subjectFilter: UsageSubjectFilterSchema.meta({ description: '当前选择意图' }),
  expectedScope: z.enum(['team', 'self']).meta({ description: '期望授权范围，仅用于检测变化' }),
  requestKey: z.string().min(1).max(200).meta({ description: '操作标识', example: 'usage-1' })
};
const DepartmentActionSchema = z.strictObject({
  orgId: ObjectIdSchema.meta({ description: '本次点击的部门 ID' }),
  directoryId: z
    .union([ObjectIdSchema, z.literal('')])
    .optional()
    .meta({ description: '当前浏览目录' })
});
const UsageQueryShape = {
  ...UsageOperationShape,
  filters: UsageCommonFiltersSchema.meta({ description: '三个读取端共用的条件' }),
  departmentAction: DepartmentActionSchema.optional().meta({ description: '服务端串行点框命令' }),
  visibleDepartmentIds: z
    .array(ObjectIdSchema)
    .optional()
    .meta({ description: '当前可见部门，仅用于回填三态' })
};

export const UsageQueryBodySchema = z
  .discriminatedUnion('view', [
    z.strictObject({
      ...UsageQueryShape,
      view: z.literal('detail').meta({ description: '使用明细' }),
      pagination: createPaginationSchema().optional().meta({ description: '明细分页' })
    }),
    z.strictObject({
      ...UsageQueryShape,
      view: z.literal('dashboard').meta({ description: '日统计' }),
      unit: z.literal('day').default('day').meta({ description: '按日统计' })
    })
  ])
  .refine((value) => !value.departmentAction || value.subjectFilter.type === 'department', {
    path: ['departmentAction'],
    message: 'Department action requires department filter'
  });
export type UsageQueryBody = z.infer<typeof UsageQueryBodySchema>;

export const UsageQueryResponseSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('detail').meta({ description: '明细结果' }),
    data: GetUsageResponseSchema.meta({ description: '明细和总数' }),
    context: UsageFilterContextSchema.meta({ description: '最新筛选上下文' })
  }),
  z.object({
    view: z.literal('dashboard').meta({ description: '统计结果' }),
    data: GetUsageDashboardResponseSchema.meta({ description: '日统计' }),
    context: UsageFilterContextSchema.meta({ description: '最新筛选上下文' })
  })
]);
export type UsageQueryResponse = z.infer<typeof UsageQueryResponseSchema>;

export const UsageFilterOptionsBodySchema = z
  .discriminatedUnion('intent', [
    z.strictObject({
      ...UsageOperationShape,
      intent: z.literal('validate').meta({ description: '导出前校验，不返回选项' })
    }),
    z.strictObject({
      ...UsageOperationShape,
      intent: z.literal('options').meta({ description: '读取选项并校验选择' }),
      searchKey: z.string().optional().meta({ description: '当前类型的搜索关键词' }),
      pagination: createPaginationSchema().optional().meta({ description: '选项分页' }),
      departmentDirectoryId: z
        .union([ObjectIdSchema, z.literal('')])
        .optional()
        .meta({ description: '当前部门目录，空字符串表示根' }),
      visibleDepartmentIds: z.array(ObjectIdSchema).optional().meta({ description: '当前可见部门' })
    })
  ])
  .refine(
    (value) =>
      value.intent !== 'options' ||
      value.departmentDirectoryId === undefined ||
      value.subjectFilter.type === 'department',
    {
      path: ['departmentDirectoryId'],
      message: 'Department directory requires department filter'
    }
  );
export type UsageFilterOptionsBody = z.infer<typeof UsageFilterOptionsBodySchema>;

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

export const UsageExportConflictSchema = z.object({
  reason: z
    .enum(['USAGE_FILTER_CHANGED', 'USAGE_PERMISSION_CHANGED'])
    .meta({ description: '导出停止原因' }),
  context: UsageFilterContextSchema.meta({ description: '需先提交到页面的最新范围' })
});
export type UsageExportConflict = z.infer<typeof UsageExportConflictSchema>;
