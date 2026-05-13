/**
 * FastGPT Providers for diting-rag-ts
 * 封装 FastGPT 现有的 LLM/Embedding/VectorSearch/FullTextSearch/MixedSearch/Rerank 能力
 * 使用 capabilities.ts 中的公共能力，不依赖完整的 controller 逻辑
 * diting-rag-ts 负责 agentic search 的完整逻辑，包括问题分析、问题改写/拆解、检索、重排、过滤等。
 * fastgpt 只需要提供各provider能力，处理好输入输出适配即可。
 */

import { getVectorsByText } from '../../../ai/embedding';
import type { EmbeddingModelItemType } from '@fastgpt/global/core/ai/model.d';
import { createChatCompletion } from '../../../ai/config';
import {
  getEmbeddingModel,
  getDefaultRerankModel,
  getRerankModel,
  getLLMModel
} from '../../../ai/model';
import type { LLMModelItemType, RerankModelItemType } from '@fastgpt/global/core/ai/model.d';
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  UnStreamResponseType
} from '@fastgpt/global/core/ai/llm/type';
import { reRankRecall } from '../../../../core/ai/rerank';
import { addLog } from '../../../../common/system/log';
import { parseReasoningContent } from '../../../ai/utils';
import { stripThinkBlocks } from 'diting-rag-ts';

// 导入公共能力（从 capabilities.ts）
import {
  embeddingRecall,
  fullTextRecall,
  mixedRecall,
  rerank as capabilitiesRerank
} from '../capabilities';
import type {
  LLMProvider,
  EmbeddingProvider,
  VectorSearchProvider,
  FullTextSearchProvider,
  MixedSearchProvider,
  RerankProvider,
  SearchResult,
  ChunkResult,
  RerankResult,
  EmbedResult,
  LLMResponse,
  LLMCallOptions,
  LLMMessage,
  MixedSearchOptions,
  FullTextSearchOptions,
  VectorSearchOptions
} from 'diting-rag-ts';

export interface FastGPTProvidersConfig {
  llmModel: string;
  embedModel: string;
  rerankModel?: string;
  teamId: string;
}

/**
 * 检测响应是否被截断（括号、引号不平衡）
 */
function detectTruncation(content: string): boolean {
  let braceDepth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === '\\') {
      escaped = true;
      continue;
    }
    if (c === '"' && !escaped) {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (c === '{') braceDepth++;
    else if (c === '}') {
      braceDepth--;
      if (braceDepth < 0) return true;
    }
  }
  if (inString) return true;
  if (braceDepth !== 0) return true;
  return false;
}

/**
 * 创建 FastGPT LLM Provider
 *
 * 使用 createChatCompletion 替代直接调用 ai.chat.completions.create，
 * 复用模型名解析、requestUrl、requestAuth、超时等已有逻辑。
 *
 * 对齐 builtin adapter：
 * - 不主动传 max_tokens，避免某些模型因 max_tokens 过小而截断 JSON 输出
 * - 增加截断检测与自动重试（max_tokens 翻倍）
 */
export function createFastGPTLLMProvider(config: FastGPTProvidersConfig): LLMProvider {
  return {
    async chat(messages: LLMMessage[], options?: LLMCallOptions): Promise<LLMResponse> {
      const modelData = getLLMModel(config.llmModel);

      const body: Record<string, unknown> = {
        model: config.llmModel,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: options?.temperature,
        // 仅当调用方显式传了 maxTokens 时才发送，避免部分模型兼容问题
        ...(options?.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
        stream: false,
        ...options?.extra
      };

      // 添加 tools 和 tool_choice（agentic search function calling 依赖此参数）
      if (options?.tools?.length) {
        body.tools = options.tools;
        body.tool_choice = options.toolChoice ?? 'auto';
      }

      // 过滤 undefined/null
      const filteredBody = Object.fromEntries(
        Object.entries(body).filter(([_, v]) => v !== null && v !== undefined)
      );

      const result = await createChatCompletion({
        modelData: modelData ?? undefined,
        body: filteredBody as unknown as ChatCompletionCreateParamsNonStreaming,
        options: options?.requestOptions as any
      });

      // createChatCompletion 返回 union 类型，根据 stream:false 收窄
      if (result.isStreamResponse) {
        throw new Error('Unexpected stream response for non-streaming request');
      }

      const response = result.response;
      const choice = response.choices[0];
      const msg = choice?.message;
      const rawContent = msg?.content || '';
      const finishReason = choice?.finish_reason;
      const reasoningContent = (msg as any)?.reasoning_content;

      // 处理 thinking 内容：API 已返回 reasoning_content 则直接用；
      // 否则若模型是 reasoning 类型，从 content 中解析 <think> 标签
      let content = rawContent;
      let reasoning: string | undefined = reasoningContent || undefined;
      if (modelData?.reasoning && !reasoningContent && rawContent) {
        const [think, answer] = parseReasoningContent(rawContent);
        content = answer;
        reasoning = think || undefined;
      }

      // 截断检测与自动重试（对齐 builtin adapter）
      const truncated =
        finishReason === 'length' || (finishReason !== 'stop' && detectTruncation(content));

      if (truncated && options?.maxTokens) {
        addLog.warn('[FastGPTLLMProvider] response truncated, retrying with 2x maxTokens', {
          model: config.llmModel,
          maxTokens: options.maxTokens,
          finishReason,
          contentPreview: content.slice(0, 200)
        });

        const retryBody = {
          ...filteredBody,
          max_tokens: options.maxTokens * 2
        };
        const retryResult = await createChatCompletion({
          modelData: modelData ?? undefined,
          body: retryBody as unknown as ChatCompletionCreateParamsNonStreaming,
          options: options?.requestOptions as any
        });

        if (!retryResult.isStreamResponse) {
          const retryResponse = retryResult.response;
          const retryChoice = retryResponse.choices[0];
          const retryMsg = retryChoice?.message;
          const retryRawContent = retryMsg?.content || '';
          const retryReasoningContent = (retryMsg as any)?.reasoning_content;

          let retryContent = retryRawContent;
          let retryReasoning: string | undefined = retryReasoningContent || undefined;
          if (modelData?.reasoning && !retryReasoningContent && retryRawContent) {
            const [think, answer] = parseReasoningContent(retryRawContent);
            retryContent = answer;
            retryReasoning = think || undefined;
          }

          return {
            content: retryContent,
            reasoning: retryReasoning,
            toolCalls: (retryMsg?.tool_calls ?? msg?.tool_calls ?? []).map((tc: any) => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.function.name, arguments: tc.function.arguments }
            })),
            usage: {
              inputTokens: retryResponse.usage?.prompt_tokens ?? response.usage?.prompt_tokens,
              outputTokens:
                retryResponse.usage?.completion_tokens ?? response.usage?.completion_tokens
            }
          };
        }
      }

      return {
        content,
        reasoning,
        toolCalls: (msg?.tool_calls ?? []).map((tc: any) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.function.name, arguments: tc.function.arguments }
        })),
        usage: {
          inputTokens: response.usage?.prompt_tokens,
          outputTokens: response.usage?.completion_tokens
        }
      };
    },

    async *chatStream(
      messages: LLMMessage[],
      options?: LLMCallOptions
    ): AsyncIterable<LLMResponse> {
      const modelData = getLLMModel(config.llmModel);

      const body: Record<string, unknown> = {
        model: config.llmModel,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: options?.temperature,
        ...(options?.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
        stream: true,
        ...options?.extra
      };

      // 添加 tools 和 tool_choice（agentic search function calling 依赖此参数）
      if (options?.tools?.length) {
        body.tools = options.tools;
        body.tool_choice = options.toolChoice ?? 'auto';
      }

      const filteredBody = Object.fromEntries(
        Object.entries(body).filter(([_, v]) => v !== null && v !== undefined)
      );

      const result = await createChatCompletion({
        modelData: modelData ?? undefined,
        body: filteredBody as unknown as ChatCompletionCreateParamsStreaming,
        options: options?.requestOptions as any
      });

      // createChatCompletion 返回 union 类型，根据 stream:true 收窄
      if (!result.isStreamResponse) {
        throw new Error('Unexpected non-stream response for streaming request');
      }

      const response = result.response;

      // 缓冲所有 chunk（不立即 yield），截断检测后再决定输出
      type StreamChunk = {
        content: string;
        reasoning?: string;
        toolCalls?: Array<{
          id: string;
          type: 'function';
          function: { name: any; arguments: any };
        }>;
      };
      const chunkBuffer: StreamChunk[] = [];
      let accumulatedContent = '';
      let accumulatedReasoning = '';
      let streamFinishReason: string | undefined;

      for await (const chunk of response) {
        const delta = chunk.choices[0]?.delta;
        const choice = chunk.choices[0];
        if (choice?.finish_reason) streamFinishReason = choice.finish_reason;
        if (!delta) continue;

        const rawContent = delta.content || '';
        const reasoningContent = (delta as any)?.reasoning_content;

        let content = rawContent;
        let reasoning: string | undefined = reasoningContent || undefined;
        if (modelData?.reasoning && !reasoningContent && rawContent) {
          const [think, answer] = parseReasoningContent(rawContent);
          content = answer;
          reasoning = think || undefined;
        }

        if (content) accumulatedContent += content;
        if (reasoning) accumulatedReasoning += reasoning;

        if (content || reasoning || delta.tool_calls?.length) {
          chunkBuffer.push({
            content,
            reasoning,
            toolCalls: (delta.tool_calls ?? []).map((tc: any) => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.function?.name, arguments: tc.function?.arguments }
            }))
          });
        }
      }

      // 截断检测
      const truncated =
        streamFinishReason === 'length' ||
        (streamFinishReason !== 'stop' && detectTruncation(accumulatedContent));

      if (truncated && options?.maxTokens) {
        addLog.warn('[FastGPTLLMProvider] stream truncated, retrying with 2x maxTokens', {
          model: config.llmModel,
          maxTokens: options.maxTokens,
          finishReason: streamFinishReason,
          contentPreview: accumulatedContent.slice(0, 200)
        });

        // 丢弃缓冲（截断内容），用 2x maxTokens 重试
        const retryBody = {
          ...filteredBody,
          max_tokens: options.maxTokens * 2,
          stream: false
        };
        const retryResult = await createChatCompletion({
          modelData: modelData ?? undefined,
          body: retryBody as unknown as ChatCompletionCreateParamsNonStreaming,
          options: options?.requestOptions as any
        });

        if (!retryResult.isStreamResponse) {
          const retryResponse = retryResult.response;
          const retryChoice = retryResponse.choices[0];
          const retryMsg = retryChoice?.message;
          const retryRawContent = retryMsg?.content || '';
          const retryReasoningContent = (retryMsg as any)?.reasoning_content;

          let retryContent = retryRawContent;
          let retryReasoning: string | undefined = retryReasoningContent || undefined;
          if (modelData?.reasoning && !retryReasoningContent && retryRawContent) {
            const [think, answer] = parseReasoningContent(retryRawContent);
            retryContent = answer;
            retryReasoning = think || undefined;
          }

          yield {
            content: retryContent,
            reasoning: retryReasoning,
            toolCalls: (retryMsg?.tool_calls ?? []).map((tc: any) => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.function?.name, arguments: tc.function?.arguments }
            })),
            usage: {
              inputTokens: retryResponse.usage?.prompt_tokens,
              outputTokens: retryResponse.usage?.completion_tokens
            }
          };
        }
      } else {
        // 未截断：yield 缓冲的 chunk
        for (const c of chunkBuffer) {
          yield c;
        }
      }
    },

    getModelInfo(): { name: string; contextWindow: number; maxOutputTokens: number } {
      const model = getLLMModel(config.llmModel);
      return {
        name: model?.model || config.llmModel,
        contextWindow: (model as any)?.contextSize || 16000,
        maxOutputTokens: (model as any)?.maxTokens || 8192
      };
    }
  };
}

/**
 * 创建 FastGPT Embedding Provider
 */
export function createFastGPTEmbeddingProvider(config: FastGPTProvidersConfig): EmbeddingProvider {
  return {
    async embed(texts: string[]): Promise<EmbedResult> {
      const model = getEmbeddingModel(config.embedModel);
      const result = await getVectorsByText({
        model: model as EmbeddingModelItemType,
        input: texts
      });

      return {
        vectors: result.vectors,
        tokens: result.tokens
      };
    },

    getModelInfo(): { name: string; dimension: number } {
      const model = getEmbeddingModel(config.embedModel);
      return {
        name: model?.model || config.embedModel,
        dimension: model?.dimensions || 1536
      };
    }
  };
}

/**
 * 创建 FastGPT Vector Search Provider
 */
export function createFastGPTVectorSearchProvider(
  config: FastGPTProvidersConfig
): VectorSearchProvider {
  return {
    async search(
      vectors: number[][],
      datasetIds: string[],
      options: VectorSearchOptions
    ): Promise<SearchResult<ChunkResult>> {
      const startTime = Date.now();

      try {
        // 使用 embeddingRecall 而非直接调用 recallFromVectorStore，
        // 确保返回的 chunk id 是 MongoDB _id（而非向量行号），
        // 避免 getQuote 等下游接口用行号查 dataset_datas 报 CastError
        const { results } = await embeddingRecall({
          teamId: config.teamId,
          datasetIds,
          queries: [], // Provider 场景由外部传入 vectors，precomputedVectors 已提供
          model: config.embedModel,
          limit: options.limit || 10,
          forbidCollectionIdList: [],
          precomputedVectors: vectors
        });

        const chunks: ChunkResult[] = results.map((r) => ({
          id: r.id, // 已是 MongoDB _id
          content: r.q && r.a ? `${r.q}\n${r.a}` : r.q || r.a || '',
          score: r.score?.[0]?.value || 0,
          datasetId: r.datasetId || '',
          sourceName: r.sourceName || '',
          collectionId: r.collectionId,
          metadata: r.metadata || {},
          detectedLanguage: r.metadata?.detectedLanguage,
          vectorScore: r.score?.[0]?.value || 0,
          searchSource: 'vector',
          providerMetadata: {
            updateTime: (r as any).updateTime,
            chunkIndex: (r as any).chunkIndex ?? 0,
            originalScoreArray: r.score,
            q: r.q,
            a: r.a,
            sourceId: r.sourceId
          }
        }));

        return {
          chunks,
          meta: {
            searchSource: 'vector',
            provider: 'fastgpt',
            duration: Date.now() - startTime
          }
        };
      } catch (error) {
        addLog.error('[FastGPTVectorSearch] Search failed', { error });
        return {
          chunks: [],
          error: {
            code: 'VECTOR_SEARCH_ERROR',
            message: (error as Error).message,
            retryable: true
          },
          meta: {
            searchSource: 'vector',
            provider: 'fastgpt',
            duration: Date.now() - startTime
          }
        };
      }
    }
  };
}

/**
 * 创建 FastGPT FullText Search Provider
 * 使用 capabilities.ts 中的 fullTextRecall 实现全文检索
 */
export function createFastGPTFullTextSearchProvider(
  config: FastGPTProvidersConfig
): FullTextSearchProvider {
  return {
    async search(
      query: string,
      datasetIds: string[],
      options: FullTextSearchOptions
    ): Promise<SearchResult<ChunkResult>> {
      const startTime = Date.now();

      try {
        // 使用 capabilities 中的 fullTextRecall
        const result = await fullTextRecall({
          teamId: config.teamId,
          model: config.embedModel,
          datasetIds,
          queries: [query],
          limit: options.limit || 10
        });

        const chunks: ChunkResult[] = result.results.map((r: any) => {
          const rawScore = Array.isArray(r.score)
            ? r.score[0]?.value ?? 0
            : typeof r.score === 'number'
              ? r.score
              : 0;
          return {
            id: r.id || '',
            content: r.q && r.a ? `${r.q}\n${r.a}` : r.q || r.a || '',
            score: rawScore,
            datasetId: r.datasetId || '',
            sourceName: r.sourceName || '',
            collectionId: r.collectionId,
            metadata: r.metadata || {},
            detectedLanguage: r.metadata?.detectedLanguage,
            fullTextScore: rawScore,
            searchSource: 'fulltext',
            providerMetadata: {
              updateTime: r.updateTime,
              chunkIndex: r.chunkIndex ?? 0,
              originalScoreArray: Array.isArray(r.score)
                ? r.score
                : [{ type: 'fullText', value: rawScore, index: 0 }],
              q: r.q,
              a: r.a,
              sourceId: r.sourceId,
              documentId: r.documentId,
              fileId: r.fileId,
              imageId: r.imageId
            }
          };
        });

        return {
          chunks,
          meta: {
            searchSource: 'fulltext',
            provider: 'fastgpt',
            duration: Date.now() - startTime
          }
        };
      } catch (error) {
        addLog.error('[FastGPTFullTextSearch] Search failed', { error });
        return {
          chunks: [],
          error: {
            code: 'FULLTEXT_SEARCH_ERROR',
            message: (error as Error).message,
            retryable: true
          },
          meta: {
            searchSource: 'fulltext',
            provider: 'fastgpt',
            duration: Date.now() - startTime
          }
        };
      }
    }
  };
}

/**
 * 创建 FastGPT Rerank Provider
 */
export function createFastGPTRerankProvider(config: FastGPTProvidersConfig): RerankProvider {
  return {
    async rerank(query: string, chunks: ChunkResult[]): Promise<RerankResult[]> {
      try {
        const documents = chunks.map((c) => ({
          id: c.id,
          text: c.content
        }));

        let rerankModelData: RerankModelItemType | undefined;
        const rerankModelName = config.rerankModel || getDefaultRerankModel()?.model;
        if (rerankModelName) {
          rerankModelData = getRerankModel(rerankModelName);
        }

        if (!rerankModelData) {
          // c.score is already a proper number after our provider fix; use vectorScore as best signal
          return chunks.map((c) => ({
            ...c,
            rerankScore: typeof c.score === 'number' ? c.score : c.vectorScore ?? 0
          }));
        }

        const result = await reRankRecall({
          query,
          documents,
          model: rerankModelData
        });

        const rerankMap = new Map(result.results.map((r: any) => [r.id, r.score]));
        return chunks.map((c) => ({
          ...c,
          rerankScore:
            rerankMap.get(c.id) ?? (typeof c.score === 'number' ? c.score : c.vectorScore ?? 0)
        }));
      } catch (error) {
        addLog.error('[FastGPRerank] Failed', { error });
        return chunks.map((c) => ({ ...c, rerankScore: c.score }));
      }
    }
  };
}

/**
 * 创建 FastGPT Mixed Search Provider
 * 使用 capabilities.ts 中的 mixedRecall 实现混合检索
 */
export function createFastGPTMixedSearchProvider(
  config: FastGPTProvidersConfig
): MixedSearchProvider {
  return {
    async search(
      query: string,
      datasetIds: string[],
      options: MixedSearchOptions,
      _embeddingOrVectors: { vectors?: number[][]; embeddingProvider?: EmbeddingProvider }
    ): Promise<SearchResult<ChunkResult>> {
      const startTime = Date.now();

      try {
        addLog.info(
          `[MixedSearchProvider] query="${query}", datasetIds=${JSON.stringify(datasetIds)}, limit=${options.limit || 10}`
        );

        // 使用 capabilities 中的 mixedRecall
        const result = await mixedRecall({
          teamId: config.teamId,
          datasetIds,
          queries: [query],
          model: config.embedModel,
          limit: options.limit || 10,
          embeddingWeight: options.vectorWeight ?? 0.5,
          usingReRank: false,
          similarity: 0,
          rerankWeight: 0.5
        });

        addLog.info(`[MixedSearchProvider] mixedRecall done: results=${result.results.length}`);

        // 先收集所有 chunk 的原始分数，再统一处理
        type RawChunkInfo = {
          r: any;
          vectorScore: number | undefined;
          reRankScore: number | undefined;
          rrfScore: number | undefined;
          fullTextScore: number | undefined;
        };
        const rawChunkInfos: RawChunkInfo[] = result.results.map((r: any) => {
          const scoreArr = Array.isArray(r.score) ? r.score : [];
          return {
            r,
            reRankScore: scoreArr.find((s: any) => s.type === 'reRank')?.value as
              | number
              | undefined,
            vectorScore: scoreArr.find((s: any) => s.type === 'embedding')?.value as
              | number
              | undefined,
            rrfScore: scoreArr.find((s: any) => s.type === 'rrf')?.value as number | undefined,
            fullTextScore: scoreArr.find((s: any) => s.type === 'fullText')?.value as
              | number
              | undefined
          };
        });

        // 判断是否有语义相似度分数可用（embedding 或 reRank）
        const hasSemanticScore = rawChunkInfos.some(
          (item) => item.vectorScore !== undefined || item.reRankScore !== undefined
        );

        // 如果只有 RRF 分数（如 Milvus hybrid search 返回的 rrf 类型），做归一化
        const maxRrfScore = hasSemanticScore
          ? 1
          : Math.max(...rawChunkInfos.map((item) => item.rrfScore ?? 0), 1e-6);

        const chunks: ChunkResult[] = rawChunkInfos.map(
          ({ r, vectorScore, reRankScore, rrfScore, fullTextScore }) => {
            let numericScore: number;
            if (reRankScore !== undefined) {
              numericScore = reRankScore; // 重排分数最优先
            } else if (vectorScore !== undefined) {
              numericScore = vectorScore; // 向量余弦相似度（0-1）
            } else if (rrfScore !== undefined) {
              numericScore = hasSemanticScore ? rrfScore : rrfScore / maxRrfScore; // 归一化 RRF
            } else {
              numericScore = 0;
            }
            return {
              id: r.id || r._id?.toString() || '',
              content: r.q && r.a ? `${r.q}\n${r.a}` : r.q || r.a || '',
              score: numericScore,
              datasetId: r.datasetId || '',
              sourceName: r.sourceName || '',
              collectionId: r.collectionId,
              metadata: r.metadata || {},
              detectedLanguage: r.metadata?.detectedLanguage,
              searchSource: 'mixed',
              vectorScore,
              fullTextScore,
              // 透传 FastGPT 平台所需的额外字段
              providerMetadata: {
                updateTime: r.updateTime,
                chunkIndex: r.chunkIndex ?? 0,
                imageDescMap: r.imageDescMap,
                originalScoreArray: Array.isArray(r.score) ? r.score : undefined,
                q: r.q,
                a: r.a,
                sourceId: r.sourceId,
                documentId: r.documentId,
                fileId: r.fileId,
                imageId: r.imageId
              }
            };
          }
        );

        return {
          chunks,
          meta: {
            searchSource: 'mixed',
            provider: 'fastgpt',
            duration: Date.now() - startTime,
            totalTokens: result.tokens, // 传递 embedding token 数
            queryAnalytics: {
              originalQuery: query
            }
          }
        };
      } catch (error) {
        addLog.error('[FastGPTMixedSearch] Search failed', { error });
        return {
          chunks: [],
          error: {
            code: 'MIXED_SEARCH_ERROR',
            message: (error as Error).message,
            retryable: true
          },
          meta: {
            searchSource: 'mixed',
            provider: 'fastgpt',
            duration: Date.now() - startTime
          }
        };
      }
    }
  };
}

/**
 * 创建所有 FastGPT Providers
 * 注意：字段名与 diting-rag-ts 的 AgenticSearchProviders 接口对齐
 */
export function createFastGPTProviders(config: FastGPTProvidersConfig) {
  return {
    llm: createFastGPTLLMProvider(config),
    embed: createFastGPTEmbeddingProvider(config),
    vectorSearch: createFastGPTVectorSearchProvider(config),
    fullTextSearch: createFastGPTFullTextSearchProvider(config),
    mixedSearch: createFastGPTMixedSearchProvider(config),
    reranker: createFastGPTRerankProvider(config)
  };
}
