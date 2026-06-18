/**
 * Agentic Search 入口
 * 调用 diting-rag-ts 的 createAgenticSearch 实现多轮智能检索
 */

import { createAgenticSearch, createLogger, LogLevel } from 'diting-rag-ts';
import type { AgenticSearchResult } from 'diting-rag-ts';
import { detectLang } from 'diting-rag-ts';
import { chunkItemsToSearchResults } from './providers/agenticAdapter';
import { createFastGPTProviders } from './providers/fastgptProviders';
import {
  defaultSearchDatasetData,
  type SearchDatasetDataResponse,
  resolveCollectionFilter
} from './controller';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { SearchDatasetDataProps } from './controller';
import { getDefaultLLMModel, getDefaultRerankModel } from '../../ai/model';
import { MongoDatasetData } from '../data/schema';
import { MongoDatasetCollection } from '../collection/schema';
import { Types } from '../../../common/mongo';
import { addLog } from '../../../common/system/log';
import type { WorkflowResponseType } from '../../../core/workflow/dispatch/type';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { i18nT } from '../../../../global/common/i18n/utils';
import { formatAgenticLabel, getSearchingFallback } from './agenticSearchLabels';

// 本地定义 AgentEvent 类型（避免依赖 diting-rag-ts 新版 dist）
type AgentEvent = {
  step: string;
  detail?: string;
  reason?: string;
  playbook?: string;
  timestamp: number;
  extra?: Record<string, unknown>;
};

export type AgenticSearchDispatchProps = SearchDatasetDataProps & {
  [NodeInputKeyEnum.datasetAgenticSearchLLMModelId]?: string;
  [NodeInputKeyEnum.datasetAgenticSearchRerankModelId]?: string;
  agenticSearchReasoning?: boolean;
  workflowStreamResponse?: WorkflowResponseType;
  synonymDatasetIds?: string[];
  /** 调用方预先做过指代消解/同义词标准化的查询，优先作为 diting-rag-ts 的入口 query */
  preResolvedQuery?: string;
  /** 调用方预先计算的 query 变体列表，diting-rag-ts 用来跳过内部 query_rewrite LLM 调用 */
  preComputedQueries?: string[];
  /** 调用方在 agenticSearch 之前已检索到的结果（如 SQL 结构化数据），作为 priorContext 传给 agent */
  preSearchRes?: SearchDataResponseItemType[];
  /** 调用方预先检测的用户查询语言（ISO 639-1），避免 agenticSearch 内部重复检测 */
  queryLanguage?: string;
};

/**
 * 将预先检索到的结果格式化为 priorContext 文本，供 diting-rag-ts agent 参考
 * c.q 存的是自然语言答案（SQL 执行结果的人类可读摘要），是最有价值的内容
 */
function formatPreSearchResAsContext(chunks: SearchDataResponseItemType[]): string {
  return chunks
    .map((c) => {
      const lines = [`[Source: ${c.sourceName || 'Unknown Source'}]`];
      if (c.q) lines.push(c.q);
      return lines.join('\n');
    })
    .join('\n\n');
}

/**
 * 从 MongoDB 采样语言分布，用于初始化 LanguageTracker。
 * 使用 $sample 随机抽取 N 条 chunk 并聚合 detectLanguage。
 *
 * @param datasetIds 要采样的知识库 ID 列表
 * @returns 语言分布 { zh: 120, en: 60 } 或 null（采样失败/空 KB）
 */
async function sampleLanguageDistribution(
  datasetIds: string[]
): Promise<Record<string, number> | null> {
  try {
    const sampleSize = (() => {
      const env = process.env.AGENTIC_LANG_SAMPLE_SIZE;
      if (env !== undefined && env !== null && env !== '') {
        const parsed = parseInt(String(env), 10);
        if (!isNaN(parsed)) return Math.max(10, Math.min(1000, parsed));
      }
      return 200;
    })();

    const results = await MongoDatasetData.aggregate([
      {
        $match: {
          datasetId: { $in: datasetIds.map((id) => new Types.ObjectId(id)) }
        }
      },
      { $sample: { size: sampleSize } },
      {
        $project: {
          q: 1,
          'metadata.detectedLanguage': 1
        }
      }
      // Set allowDiskUse for large KBs with many chunks
    ]).allowDiskUse(true);

    const stats: Record<string, number> = {};
    let usedMetadata = 0;
    let usedDetectLang = 0;
    let fallbackOther = 0;
    for (const doc of results) {
      let lang: string;
      if (doc.metadata?.detectedLanguage) {
        lang = doc.metadata.detectedLanguage;
        usedMetadata++;
      } else if (typeof doc.q === 'string') {
        lang = detectLang(doc.q);
        usedDetectLang++;
      } else {
        lang = 'other';
        fallbackOther++;
      }
      stats[lang] = (stats[lang] || 0) + 1;
    }

    addLog.info('[AgenticSearch] Language sample done', {
      sampleSize: results.length,
      stats,
      sources: { metadata: usedMetadata, detectLang: usedDetectLang, fallbackOther }
    });

    return Object.keys(stats).length > 0 ? stats : null;
  } catch (err) {
    addLog.warn('[AgenticSearch] Language sample failed', { err });
    return null;
  }
}

export async function agenticSearchDispatch(
  props: AgenticSearchDispatchProps
): Promise<SearchDatasetDataResponse> {
  const {
    agenticSearchLLMModelId,
    agenticSearchRerankModelId,
    agenticSearchReasoning,
    workflowStreamResponse,
    teamId,
    modelId: embedModelId,
    datasetIds,
    reRankQuery,
    histories,
    limit: maxTokens,
    preResolvedQuery,
    preComputedQueries,
    preSearchRes,
    queryLanguage
  } = props;

  try {
    // 获取默认 LLM 模型
    const defaultLLM = getDefaultLLMModel();
    const llmModelId = agenticSearchLLMModelId || defaultLLM?.id;
    const defaultRerankModel = getDefaultRerankModel();
    const rerankModelId = agenticSearchRerankModelId || defaultRerankModel?.id;

    addLog.info('[AgenticSearch] Starting', {
      llmModelId,
      rerankModelId,
      embedModelId,
      datasetIds: datasetIds?.length,
      query: reRankQuery
    });

    const agenticStartTime = Date.now();

    // 创建 Providers
    const providers = createFastGPTProviders({
      llmModelId,
      embedModelId,
      rerankModelId,
      teamId
    });

    // 创建 Logger
    const logger = createLogger({
      level: LogLevel.INFO,
      prefix: 'agentic-search'
    });

    // 合并 forbidCollectionIds：系统级 forbid + 权限级 forbid
    const systemForbiddenCols = await MongoDatasetCollection.find(
      { datasetId: { $in: datasetIds }, forbid: true, deleteTime: null },
      '_id'
    ).lean();
    const forbidSet = new Set<string>();
    systemForbiddenCols.forEach((c) => forbidSet.add(String(c._id)));
    props.authForbidCollectionIds?.forEach((id) => forbidSet.add(id));

    // 标签过滤：将白名单转黑名单追加到 forbidCollectionIds
    const filterWhitelist = await resolveCollectionFilter({
      teamId,
      datasetIds,
      collectionFilterMatch: props.collectionFilterMatch
    });
    if (filterWhitelist !== undefined) {
      if (filterWhitelist.length === 0) {
        // 标签过滤结果为空，直接返回空
        return {
          searchRes: [],
          embeddingTokens: 0,
          reRankInputTokens: 0,
          searchMode: DatasetSearchModeEnum.mixedRecall,
          limit: 0,
          similarity: 0,
          usingReRank: !!rerankModelId,
          usingSimilarityFilter: false
        };
      }
      // 查出 datasets 下所有可用 collection，不在白名单中的加入 forbid
      const allCols = await MongoDatasetCollection.find(
        { datasetId: { $in: datasetIds }, forbid: { $ne: true }, deleteTime: null, type: { $ne: 'folder' } },
        '_id'
      ).lean();
      const whitelistSet = new Set(filterWhitelist);
      allCols
        .map((c) => String(c._id))
        .filter((id) => !whitelistSet.has(id))
        .forEach((id) => forbidSet.add(id));
    }

    const mergedForbidCollectionIds: string[] | undefined =
      forbidSet.size > 0 ? Array.from(forbidSet) : undefined;

    // 创建 Agentic Search
    const agent = createAgenticSearch({
      providers: {
        llm: providers.llm,
        embed: providers.embed,
        vectorSearch: providers.vectorSearch,
        fullTextSearch: providers.fullTextSearch,
        mixedSearch: providers.mixedSearch,
        reranker: providers.reranker,
        logger // 注入 logger，使 nodes.ts 内部日志生效
      },
      logger,
      config: {
        searchMode: 'mixedRecall',
        tokenBudget: maxTokens || 5000,
        searchOnly: true, // FastGPT 自己有 AI 对话节点，diting-rag-ts 只负责多轮检索+chunk选择
        forbidCollectionIds: mergedForbidCollectionIds
      }
    });

    // 执行检索 - 转换历史格式
    // histories 是 ChatItemType[]（FastGPT 内部格式: obj/value），需转为 diting-rag-ts 需要的 role/content 格式
    const history = ((histories as ChatItemType[]) || [])
      .filter((h) => h.obj === ChatRoleEnum.Human || h.obj === ChatRoleEnum.AI)
      .map((h) => {
        // 从 value 数组中提取 text 类型内容（跳过 reasoning、file 等类型）
        const content = Array.isArray(h.value)
          ? (h.value as Array<{ type: string; text?: { content?: string } }>)
              .filter((v) => v.type === 'text')
              .map((v) => v.text?.content || '')
              .join('')
          : '';
        return {
          role: (h.obj === ChatRoleEnum.Human ? 'user' : 'assistant') as 'user' | 'assistant',
          content
        };
      })
      .filter((h) => h.content.trim().length > 0);

    // 使用调用方预检测的语言，避免重复调用 detectLang
    const agentQuery = preResolvedQuery || reRankQuery;
    const queryLang = queryLanguage || detectLang(agentQuery || '');

    // 使用流式接口遍历所有事件，累积用户可读的推理文本；有 workflowStreamResponse 时同步推送 SSE
    let finalResult: AgenticSearchResult | undefined;
    let accumulatedReasoningText = '';

    // 将预先检索到的结果（如 SQL 数据）格式化为 priorContext 文本，供 diting-rag-ts agent 参考
    const priorContext = preSearchRes?.length
      ? formatPreSearchResAsContext(preSearchRes)
      : undefined;

    // DB 采样语言分布，用于初始化 LanguageTracker（不阻塞主检索流程）
    const langSample = await sampleLanguageDistribution(datasetIds);

    const stream = agent.stream({
      query: agentQuery,
      datasetIds,
      history,
      // 若外部已有预计算变体，作为 initialQueries 传入以预填检索计划
      // diting-rag-ts 在 Blackboard Brief 中展示这些查询，引导 Agent 直接检索而非重新改写
      ...(preComputedQueries?.length ? { initialQueries: preComputedQueries } : {}),
      // 若外部已有预先检索结果（如 SQL 数据），作为 priorContext 传入
      // diting-rag-ts Agent 在 Blackboard Brief 中参考这些内容，据此决定是否补充检索
      ...(priorContext ? { priorContext } : {}),
      initialLanguageStats: langSample
    });

    let streamError: string | null = null;

    for await (const item of stream) {
      if ('chunks' in item && 'searchCount' in item) {
        finalResult = item as AgenticSearchResult;
      } else {
        const event = item as AgentEvent;
        // 追踪 runner.ts stream() 产生的 ERROR 事件：
        // runner.ts 在 catch LangGraph 异常后 yield ERROR 事件并 return，
        // 生成器正常结束（不抛），需在此处显式捕获错误信息
        if (event.step === 'error') {
          streamError = event.detail || 'Unknown agentic search error';
        }
        const reasoningText = formatEventText(event, queryLang);
        if (reasoningText) {
          accumulatedReasoningText += reasoningText;
          if (workflowStreamResponse && agenticSearchReasoning) {
            workflowStreamResponse({
              event: SseResponseEventEnum.answer,
              data: textAdaptGptResponse({ reasoning_content: reasoningText })
            });
          }
        }
      }
    }

    if (streamError) {
      throw new Error(streamError);
    }

    if (!finalResult) {
      throw new Error('[AgenticSearch] No result from stream');
    }

    const result = finalResult;

    const retrievalTime = +((Date.now() - agenticStartTime) / 1000).toFixed(2);

    // 转换为 FastGPT 格式：从 providerMetadata 读取平台特有字段，重算 rrf 排名
    const searchRes = chunkItemsToSearchResults(result.chunks);

    const response: SearchDatasetDataResponse = {
      searchRes,
      embeddingTokens: (result as any).embeddingTokens ?? 0,
      reRankInputTokens: (result as any).rerankInputTokens ?? 0,
      searchMode: DatasetSearchModeEnum.mixedRecall,
      limit: searchRes.length,
      similarity: 0,
      usingReRank: !!rerankModelId,
      usingSimilarityFilter: false,
      retrievalTime,
      // 思考过程
      agenticSearchResult: {
        // reasoningText 用于显示搜索过程，不论是否开启推理都有内容
        reasoningText: accumulatedReasoningText,
        searchCount: result.searchCount || 0,
        toolCallCount: result.toolCallCount || 0,
        llmModelId: llmModelId,
        llmInputTokens: result.llmInputTokens || 0,
        llmOutputTokens: result.llmOutputTokens || 0,
        playbook: result.playbook,
        executionPath: result.executionPath,
        confidence: result.confidence,
        queryLanguage: queryLang
      }
    };

    addLog.info('[AgenticSearch] Completed', {
      searchCount: result.searchCount,
      chunkCount: result.chunks.length
    });

    return response;
  } catch (error) {
    addLog.error('[AgenticSearch] Failed', { error });

    const errorMsg = error instanceof Error ? error.message : String(error);
    // diting-rag-ts agent 节点 LLM 重试全部耗尽且无 chunks：
    // 底模完全不可用，不应静默降级，需将错误抛给前端展示
    if (errorMsg.includes('LLM call failed after') && errorMsg.includes('no chunks collected')) {
      addLog.error('[AgenticSearch] LLM fatal error, propagating to caller');
      throw new Error(i18nT('chat:language_model_error'));
    }

    // 非 LLM 致命错误（search/EMB 异常）：降级使用默认混合检索
    addLog.warn('[AgenticSearch] Non-fatal error, falling back to default search');
    return defaultSearchDatasetData({
      ...props,
      searchMode: DatasetSearchModeEnum.mixedRecall
    });
  }
}

/**
 * 将 AgentEvent 格式化为可读的推理文本。
 * 多语言标签委托给 agenticSearchLabels.ts（eld 60 种语言全覆盖）。
 */
function formatEventText(event: AgentEvent, lang: string): string {
  // thinking / playbook_selected：直接透传 LLM 生成的内容
  if (event.step === 'thinking') {
    return event.detail ? `${event.detail}\n` : '';
  }
  if (event.step === 'playbook_selected') {
    return (event.extra?.analysis as string) ?? '';
  }

  // generating：searchOnly 模式静默
  if (event.step === 'generating') return '';

  // final：refuse 时返回文本，否则静默
  if (event.step === 'final') {
    return event.extra?.refuse ? formatAgenticLabel('final', lang, {}) : '';
  }

  // search_done：count=0 时静默
  if (event.step === 'search_done') {
    const count = event.extra?.chunkCount as number | undefined;
    if (!count) return '';
  }

  // rewrite_done：queries 为空时静默
  if (event.step === 'rewrite_done') {
    const queries = (event.extra?.queries as string[] | undefined) ?? [];
    if (!queries.length) return '';
  }

  // searching：queries 为空时用 fallback
  if (event.step === 'searching') {
    const queries = (event.extra?.queries as string[] | undefined) ?? [];
    if (!queries.length) {
      return getSearchingFallback(lang) || '';
    }
  }

  // 其他事件：委托给 agenticSearchLabels
  return formatAgenticLabel(event.step, lang, {
    queries: (event.extra?.queries as string[]) ?? [],
    count: String(event.extra?.chunkCount ?? ''),
    detail: event.detail ?? '',
    analysis: (event.extra?.analysis as string) ?? ''
  });
}
