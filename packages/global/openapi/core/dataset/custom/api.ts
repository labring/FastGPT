import z from 'zod';
import { DatasetSearchModeEnum, RerankMethodEnum } from '../../../../core/dataset/constants';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { SearchDataResponseItemSchema } from '../../../../core/dataset/type';

/* ============================================================================
 * API: 多知识库检索
 * Route: POST /api/core/dataset/custom/searchApi
 * ============================================================================ */

export const SearchApiBodySchema = z.object({
  datasetIds: z.array(ObjectIdSchema).min(1).meta({
    description: '知识库 ID 列表，支持跨知识库检索'
  }),
  text: z.string().min(1).meta({
    example: 'FastGPT 是什么',
    description: '搜索文本/查询问题'
  }),
  searchMode: z.enum(DatasetSearchModeEnum).optional().meta({
    example: DatasetSearchModeEnum.mixedRecall,
    description: '搜索模式：mixedRecall=混合召回，embedding=向量搜索，fullText=全文搜索'
  }),
  similarity: z.number().optional().meta({
    example: 0.3,
    description: '最低相似度阈值（0-1），值越低返回结果越多'
  }),
  limit: z.number().optional().meta({
    example: 5000,
    description: '最大返回 token 数'
  }),
  embeddingModelId: z.string().optional().meta({
    example: 'text-embedding-3-small',
    description: '向量嵌入模型 ID，不传则使用知识库默认模型'
  }),
  usingReRank: z.boolean().optional().meta({
    example: true,
    description: '是否使用重排序模型进行结果优化'
  }),
  rerankModelId: z.string().optional().meta({
    example: 'bge-reranker-v2-m3',
    description: '重排序模型 ID'
  }),
  rerankMethod: z.enum(RerankMethodEnum).optional().meta({
    description: '重排序方法'
  }),
  rerankWeight: z.number().optional().meta({
    example: 0.5,
    description: '重排序权重'
  }),
  datasetSearchUsingExtensionQuery: z.boolean().optional().meta({
    example: true,
    description: '是否启用 LLM 问题扩展'
  }),
  datasetSearchExtensionModelId: z.string().optional().meta({
    example: 'gpt-4o-mini',
    description: '问题扩展使用的 LLM 模型 ID'
  }),
  datasetSearchExtensionBg: z.string().optional().meta({
    example: '用户正在查询产品文档相关的技术问题',
    description: '问题扩展背景描述'
  }),
  agenticSearch: z.boolean().optional().meta({
    example: false,
    description: '是否启用 Agentic 深度检索'
  }),
  datasetDeepSearchModelId: z.string().optional().meta({
    example: 'gpt-4o-mini',
    description: '深度检索 LLM 模型 ID'
  }),
  datasetDeepSearchMaxTimes: z.number().optional().meta({
    example: 3,
    description: '深度检索最大轮次'
  }),
  datasetDeepSearchBg: z.string().optional().meta({
    description: '深度检索背景描述'
  })
});
export type SearchApiBody = z.infer<typeof SearchApiBodySchema>;

export const SearchApiResponseSchema = z.object({
  list: z.array(SearchDataResponseItemSchema).meta({
    description: '检索结果列表'
  }),
  duration: z.string().meta({
    example: '1.523s',
    description: '检索耗时'
  }),
  usingReRank: z.boolean().meta({
    description: '是否使用了重排序'
  }),
  queryExtensionModelId: z.string().optional().meta({
    description: '问题扩展使用的模型 ID'
  }),
  agenticSearchResult: z
    .object({
      reasoningText: z.string().meta({ description: '思考过程文本' }),
      searchCount: z.number().meta({ description: '实际检索轮次' }),
      toolCallCount: z.number().meta({ description: 'Tool 调用总次数' })
    })
    .optional()
    .meta({
      description: 'Agentic 深度检索结果（启用 agenticSearch 时返回）'
    })
});
export type SearchApiResponse = z.infer<typeof SearchApiResponseSchema>;
