/**
 * Agentic Search 入口
 * 调用 diting-rag-ts 的 createAgenticSearch 实现多轮智能检索
 */

import { createAgenticSearch, createLogger, LogLevel } from 'diting-rag-ts';
import type { AgenticSearchResult } from 'diting-rag-ts';
import { chunkItemsToSearchResults } from './providers/agenticAdapter';
import { createFastGPTProviders } from './providers/fastgptProviders';
import { defaultSearchDatasetData, type SearchDatasetDataResponse } from './controller';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { SearchDatasetDataProps } from './controller';
import { getDefaultLLMModel, getDefaultRerankModel } from '../../ai/model';
import { addLog } from '../../../common/system/log';
import type { WorkflowResponseType } from '../../../core/workflow/dispatch/type';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';

// 本地定义 AgentEvent 类型（避免依赖 diting-rag-ts 新版 dist）
type AgentEvent = {
  step: string;
  detail?: string;
  reason?: string;
  playbook?: string;
  timestamp: number;
  extra?: Record<string, unknown>;
};

// 从问题文本检测语言
function _detectLang(text: string): 'zh' | 'en' {
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  return chineseChars / Math.max(text.length, 1) > 0.1 ? 'zh' : 'en';
}

// 面向终端用户的流式推理文本模板（中英双语）
// 目标：状态事件自然融入 reasoning 流，体现 agentic 自主决策感，而非割裂的系统日志
const _PROCESS_LABELS: Record<'zh' | 'en', Record<string, (e: AgentEvent) => string>> = {
  zh: {
    // LLM 自身的推理文本，直接透传，是整个 reasoning 流的主体
    thinking: (e) => (e.detail ? `${e.detail}\n` : ''),

    // 开始执行检索——简洁标注检索词，不重复 thinking 中已有的分析过程
    searching: (e) => {
      const queries = (e.extra?.queries as string[] | undefined) ?? [];
      if (queries.length > 0) return `\n检索「${queries.join('、')}」\n`;
      return '\n检索中...\n';
    },

    // 检索完成——只报原始结果数，不重复检索词（searching 事件已展示）
    // count=0 静默：中间轮次失败不提示，最终不相关由 final 事件统一说明
    // 不说"相关"：相关性由 chunk_selector 事后判断，search_done 时尚未筛选
    search_done: (e) => {
      const count = e.extra?.chunkCount as number | undefined;
      if (!count) return '';
      return `检索到 ${count} 条结果\n`;
    },

    // LLM 自主判断现有信息不足，主动扩展——体现 agentic 迭代决策
    rewriting: () => '\n现有信息不足以完整回答，扩展检索范围...\n',

    // 展示新生成的检索方向，用列表呈现，视觉上有层次感
    rewrite_done: (e) => {
      const queries = (e.extra?.queries as string[] | undefined) ?? [];
      if (!queries.length) return '';
      return queries.map((q) => `  · ${q}`).join('\n') + '\n';
    },

    // searchOnly 模式：FastGPT 侧有独立的 LLM 对话节点，此处静默
    generating: () => '',

    // 多轮检索结束，LLM 评估信息完整性
    reflecting: () => '\n评估已收集信息的完整性...\n',

    // 反思结论——有评估说明则透传，否则静默，避免暴露内部字段
    reflect_done: (e) => (e.detail ? `${e.detail}\n` : ''),

    // 内部路由细节，不对用户暴露
    playbook_selected: () => '',

    // 最终结果——不相关早停(refuse)时向用户说明
    final: (e) => (e.extra?.refuse ? '知识库中未找到与此问题相关的内容。\n' : '')
  },
  en: {
    thinking: (e) => (e.detail ? `${e.detail}\n` : ''),

    searching: (e) => {
      const queries = (e.extra?.queries as string[] | undefined) ?? [];
      if (queries.length > 0) return `\nSearching: "${queries.join('", "')}"\n`;
      return '\nSearching...\n';
    },

    search_done: (e) => {
      const count = e.extra?.chunkCount as number | undefined;
      if (!count) return '';
      return `Retrieved ${count} result(s)\n`;
    },

    rewriting: () =>
      '\nInsufficient information to fully answer the question, broadening search scope...\n',

    rewrite_done: (e) => {
      const queries = (e.extra?.queries as string[] | undefined) ?? [];
      if (!queries.length) return '';
      return queries.map((q) => `  · ${q}`).join('\n') + '\n';
    },

    generating: () => '',

    reflecting: () => '\nEvaluating completeness of gathered information...\n',

    reflect_done: (e) => (e.detail ? `${e.detail}\n` : ''),

    playbook_selected: () => '',

    final: (e) => (e.extra?.refuse ? 'No relevant information found in the knowledge base.\n' : '')
  }
};

export type AgenticSearchDispatchProps = SearchDatasetDataProps & {
  [NodeInputKeyEnum.datasetAgenticSearchLLMModel]?: string;
  [NodeInputKeyEnum.datasetAgenticSearchRerankModel]?: string;
  agenticSearchReasoning?: boolean;
  workflowStreamResponse?: WorkflowResponseType;
  /** 调用方预先做过指代消解/同义词标准化的查询，优先作为 diting-rag-ts 的入口 query */
  preResolvedQuery?: string;
  /** 调用方预先计算的 query 变体列表，diting-rag-ts 用来跳过内部 query_rewrite LLM 调用 */
  preComputedQueries?: string[];
  /** 调用方在 agenticSearch 之前已检索到的结果（如 SQL 结构化数据），作为 priorContext 传给 agent */
  preSearchRes?: SearchDataResponseItemType[];
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

export async function agenticSearchDispatch(
  props: AgenticSearchDispatchProps
): Promise<SearchDatasetDataResponse> {
  const {
    agenticSearchLLMModel,
    agenticSearchRerankModel,
    agenticSearchReasoning,
    workflowStreamResponse,
    teamId,
    model: embedModel,
    datasetIds,
    reRankQuery,
    histories,
    limit: maxTokens,
    preResolvedQuery,
    preComputedQueries,
    preSearchRes
  } = props;

  try {
    // 获取默认 LLM 模型
    const defaultLLM = getDefaultLLMModel();
    const llmModel = agenticSearchLLMModel || defaultLLM?.model;
    const defaultRerankModel = getDefaultRerankModel();
    const rerankModel = agenticSearchRerankModel || defaultRerankModel?.model;

    addLog.info('[AgenticSearch] Starting', {
      llmModel,
      rerankModel,
      embedModel,
      datasetIds: datasetIds?.length,
      query: reRankQuery
    });

    const agenticStartTime = Date.now();

    // 创建 Providers
    const providers = createFastGPTProviders({
      llmModel,
      embedModel,
      rerankModel,
      teamId
    });

    // 创建 Logger
    const logger = createLogger({
      level: LogLevel.INFO,
      prefix: 'agentic-search'
    });

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
        searchOnly: true // FastGPT 自己有 AI 对话节点，diting-rag-ts 只负责多轮检索+chunk选择
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

    // 检测查询语言（用于格式化思考过程文本）
    // 优先使用指代消解后的 query（更完整的语义），回退到原始 reRankQuery
    const agentQuery = preResolvedQuery || reRankQuery;
    const queryLang = _detectLang(agentQuery || '');

    // 使用流式接口遍历所有事件，累积用户可读的推理文本；有 workflowStreamResponse 时同步推送 SSE
    let finalResult: AgenticSearchResult | undefined;
    let accumulatedReasoningText = '';

    // 将预先检索到的结果（如 SQL 数据）格式化为 priorContext 文本，供 diting-rag-ts agent 参考
    const priorContext = preSearchRes?.length
      ? formatPreSearchResAsContext(preSearchRes)
      : undefined;

    const stream = agent.stream({
      query: agentQuery,
      datasetIds,
      history,
      // 若外部已有预计算变体，作为 initialQueries 传入以预填检索计划
      // diting-rag-ts 在 Blackboard Brief 中展示这些查询，引导 Agent 直接检索而非重新改写
      ...(preComputedQueries?.length ? { initialQueries: preComputedQueries } : {}),
      // 若外部已有预先检索结果（如 SQL 数据），作为 priorContext 传入
      // diting-rag-ts Agent 在 Blackboard Brief 中参考这些内容，据此决定是否补充检索
      ...(priorContext ? { priorContext } : {})
    });

    for await (const item of stream) {
      if ('chunks' in item && 'searchCount' in item) {
        finalResult = item as AgenticSearchResult;
      } else {
        const event = item as AgentEvent;
        const reasoningText = _formatAgentEventText(event, queryLang);
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
      usingReRank: !!rerankModel,
      usingSimilarityFilter: false,
      retrievalTime,
      // 思考过程
      agenticSearchResult: {
        // reasoningText 用于显示搜索过程，不论是否开启推理都有内容
        reasoningText: accumulatedReasoningText,
        searchCount: result.searchCount || 0,
        toolCallCount: result.toolCallCount || 0,
        llmModel: llmModel,
        llmInputTokens: result.llmInputTokens || 0,
        llmOutputTokens: result.llmOutputTokens || 0,
        playbook: result.playbook,
        executionPath: result.executionPath,
        confidence: result.confidence
      }
    };

    addLog.info('[AgenticSearch] Completed', {
      searchCount: result.searchCount,
      chunkCount: result.chunks.length
    });

    return response;
  } catch (error) {
    addLog.error('[AgenticSearch] Failed, falling back to default', { error });

    // 降级：使用默认混合检索
    return defaultSearchDatasetData({
      ...props,
      searchMode: DatasetSearchModeEnum.mixedRecall
    });
  }
}

/**
 * 将 AgentEvent 格式化为可读的推理文本（对齐 Python PROCESS_LABELS）
 */
function _formatAgentEventText(event: AgentEvent, lang: 'zh' | 'en' = 'zh'): string {
  const labels = _PROCESS_LABELS[lang] ?? _PROCESS_LABELS.zh;
  const formatter = labels[event.step];
  if (!formatter) return '';
  return formatter(event);
}
