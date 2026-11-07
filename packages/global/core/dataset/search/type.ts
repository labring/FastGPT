import { z } from 'zod';
import { ObjectIdSchema } from '../../../common/type/mongo';
import { DatasetSearchModeEnum } from '../constants';
import { SearchDataResponseItemSchema } from '../type';

const TagNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .meta({ description: '标签名称', example: 'department' });
const TagScalarSchema = z
  .union([z.string(), z.number()])
  .meta({ description: '标签比较值', example: 'support' });

/** 公开筛选只接受确定的操作符和值，不承载工作流引用或任意数据库查询。 */
export const DatasetSearchTagConditionSchema = z.discriminatedUnion('op', [
  z.strictObject({
    tag: TagNameSchema,
    op: z.enum(['$empty', '$notEmpty']).meta({ description: '标签是否为空', example: '$notEmpty' })
  }),
  z.strictObject({
    tag: TagNameSchema,
    op: z
      .enum(['$eq', '$ne', '$gt', '$lt', '$gte', '$lte'])
      .meta({ description: '标量比较操作符', example: '$eq' }),
    value: TagScalarSchema
  }),
  z.strictObject({
    tag: TagNameSchema,
    op: z
      .enum(['$contains', '$notContains'])
      .meta({ description: '包含比较操作符', example: '$contains' }),
    value: z
      .union([z.string().min(1), z.array(z.string()).min(1)])
      .meta({ description: '匹配的文本或选项', example: 'support' })
  }),
  z.strictObject({
    tag: TagNameSchema,
    op: z
      .enum(['$startsWith', '$endsWith', '$regex'])
      .meta({ description: '文本匹配操作符', example: '$startsWith' }),
    value: z.string().min(1).meta({ description: '文本或正则表达式', example: 'support' })
  }),
  z.strictObject({
    tag: TagNameSchema,
    op: z
      .enum(['$is', '$isNot', '$in', '$notIn'])
      .meta({ description: '数组比较操作符', example: '$in' }),
    value: z
      .array(z.string())
      .meta({ description: '匹配的选项列表', example: ['support', 'sales'] })
  })
]);
export type DatasetSearchTagCondition = z.infer<typeof DatasetSearchTagConditionSchema>;

export const DatasetSearchFilterSchema = z.strictObject({
  collectionIds: z
    .array(ObjectIdSchema)
    .min(1)
    .max(500)
    .optional()
    .meta({
      description: '限制在这些集合或目录内搜索，与其他筛选条件求交集',
      example: ['507f1f77bcf86cd799439011']
    }),
  createTime: z
    .strictObject({
      gte: z.iso
        .datetime({ offset: true })
        .optional()
        .meta({ description: '创建时间下界，含边界', example: '2026-01-01T00:00:00Z' }),
      lte: z.iso
        .datetime({ offset: true })
        .optional()
        .meta({ description: '创建时间上界，含边界', example: '2026-12-31T23:59:59Z' })
    })
    .refine((range) => range.gte !== undefined || range.lte !== undefined, '时间范围不能为空')
    .refine(
      (range) =>
        range.gte === undefined ||
        range.lte === undefined ||
        Date.parse(range.gte) <= Date.parse(range.lte),
      '开始时间不能晚于结束时间'
    )
    .optional()
    .meta({ description: '集合创建时间范围', example: { gte: '2026-01-01T00:00:00Z' } }),
  tags: z
    .strictObject({
      and: z
        .array(DatasetSearchTagConditionSchema)
        .min(1)
        .max(50)
        .optional()
        .meta({
          description: '全部满足的标签条件',
          example: [{ tag: 'department', op: '$eq', value: 'support' }]
        }),
      or: z
        .array(DatasetSearchTagConditionSchema)
        .min(1)
        .max(50)
        .optional()
        .meta({
          description: '至少满足一项的标签条件',
          example: [{ tag: 'department', op: '$eq', value: 'sales' }]
        })
    })
    .refine((tags) => tags.and !== undefined || tags.or !== undefined, '标签条件不能为空')
    .optional()
    .meta({
      description: '标签条件；and 与 or 两组之间求交集',
      example: { and: [{ tag: 'department', op: '$eq', value: 'support' }] }
    })
});
export type DatasetSearchFilter = z.infer<typeof DatasetSearchFilterSchema>;

const WeightSchema = z
  .number()
  .min(0)
  .max(1)
  .meta({ description: '权重或阈值，范围 0–1', example: 0.5 });
const ModelIdSchema = z
  .string()
  .trim()
  .min(1)
  .meta({ description: '模型 ID；省略时使用有权调用的默认模型', example: 'model-identifier' });
const QueryTextSchema = z.string().trim().max(100000).meta({
  description: '查询文本，与图片至少提供一项',
  example: '如何创建知识库？'
});
const QueryImageKeysSchema = z
  .array(z.string().min(1))
  .max(10)
  .meta({
    description: '本团队上传的临时图片对象 key，最多 10 张',
    example: ['temp/teamId/search-image.png']
  });

/** 结构化 JSON 协议严格校验数值和布尔类型，拒绝字符串等隐式转换及未知配置。 */
export const DatasetSearchParamsSchema = z.strictObject({
  scope: z
    .strictObject({
      datasetIds: z
        .array(ObjectIdSchema)
        .min(1)
        .max(100)
        .meta({
          description: '目标知识库 ID，最多 100 个；服务端去重，逐个校验读取权限',
          example: ['507f1f77bcf86cd799439011']
        }),
      filter: DatasetSearchFilterSchema.optional().meta({
        description: '集合与标签筛选，需要服务端提供筛选能力',
        example: { collectionIds: ['507f1f77bcf86cd799439012'] }
      })
    })
    .meta({ description: '搜索范围', example: { datasetIds: ['507f1f77bcf86cd799439011'] } }),
  query: z
    // 两种输入分支同时表达运行时约束与文档必填关系，纯文本和纯图片均保留默认补齐。
    .union([
      z.strictObject({
        text: QueryTextSchema.min(1).meta(QueryTextSchema.meta() ?? {}),
        imageKeys: QueryImageKeysSchema.default([])
      }),
      z.strictObject({
        imageKeys: QueryImageKeysSchema.min(1).meta(QueryImageKeysSchema.meta() ?? {}),
        text: QueryTextSchema.default('')
      })
    ])
    .meta({ description: '搜索内容', example: { text: '如何创建知识库？' } }),
  retrieval: z
    .strictObject({
      mode: z
        .enum(DatasetSearchModeEnum)
        .default(DatasetSearchModeEnum.embedding)
        .meta({ description: 'embedding、fullTextRecall 或 mixedRecall', example: 'mixedRecall' }),
      embeddingWeight: WeightSchema.default(0.5).meta({
        description: '混合检索中向量结果的融合权重',
        example: 0.5
      })
    })
    .prefault({})
    .meta({ description: '召回配置', example: { mode: 'mixedRecall', embeddingWeight: 0.5 } }),
  rerank: z
    .discriminatedUnion('enabled', [
      z.strictObject({
        enabled: z.literal(false).meta({ description: '关闭重排', example: false })
      }),
      z.strictObject({
        enabled: z.literal(true).meta({ description: '启用重排', example: true }),
        modelId: ModelIdSchema.optional(),
        weight: WeightSchema.default(0.5).meta({ description: '重排结果的融合权重', example: 0.5 })
      })
    ])
    .default({ enabled: false })
    .meta({ description: '重排配置；关闭时不能传模型或权重', example: { enabled: false } }),
  queryExtension: z
    .discriminatedUnion('enabled', [
      z.strictObject({
        enabled: z.literal(false).meta({ description: '关闭查询扩展', example: false })
      }),
      z.strictObject({
        enabled: z.literal(true).meta({ description: '启用查询扩展', example: true }),
        modelId: ModelIdSchema.optional(),
        background: z
          .string()
          .max(100000)
          .default('')
          .meta({ description: '帮助模型理解查询的背景信息', example: 'FastGPT 使用文档' })
      })
    ])
    .default({ enabled: false })
    .meta({ description: '查询扩展配置', example: { enabled: false } }),
  result: z
    .strictObject({
      maxTokens: z.number().int().min(1).max(20000).default(5000).meta({
        description: '结果总 token 预算；保留完整数据块，最后一块可能使预算超出',
        example: 5000
      }),
      similarity: WeightSchema.default(0).meta({
        description: '沿用检索分数阈值语义；是否生效以 usingSimilarityFilter 为准',
        example: 0
      })
    })
    .prefault({})
    .meta({ description: '结果预算与过滤阈值', example: { maxTokens: 5000, similarity: 0 } })
});
export type DatasetSearchInput = z.input<typeof DatasetSearchParamsSchema>;
export type DatasetSearchParams = z.output<typeof DatasetSearchParamsSchema>;

export const DatasetSearchResultSchema = z.object({
  list: z
    .array(SearchDataResponseItemSchema)
    .meta({ description: '合并排序后的知识库数据块', example: [] }),
  meta: z
    .object({
      durationMs: z.number().nonnegative().meta({ description: '搜索耗时，毫秒', example: 128 }),
      searchMode: z
        .enum(DatasetSearchModeEnum)
        .meta({ description: '本次检索模式', example: 'mixedRecall' }),
      maxTokens: z.number().meta({ description: '本次结果 token 预算', example: 5000 }),
      similarity: z.number().meta({ description: '本次相似度阈值', example: 0 }),
      usingSimilarityFilter: z
        .boolean()
        .meta({ description: '本次是否实际启用相似度过滤', example: true }),
      usingReRank: z.boolean().meta({ description: '本次是否实际执行重排', example: false }),
      queryExtensionModelId: z
        .string()
        .optional()
        .meta({ description: '实际执行查询扩展的模型 ID', example: 'model-identifier' })
    })
    .meta({
      description: '搜索执行信息',
      example: {
        durationMs: 128,
        searchMode: 'mixedRecall',
        maxTokens: 5000,
        similarity: 0,
        usingSimilarityFilter: true,
        usingReRank: false
      }
    })
});
export type DatasetSearchResult = z.infer<typeof DatasetSearchResultSchema>;
