import { axios } from '../../../common/api/axios';
import { getDefaultRerankModel } from '../model';
import { getAxiosConfig } from '../config';
import { type RerankModelItemType } from '@fastgpt/global/core/ai/model.schema';
import { countPromptTokens } from '../../../common/string/tiktoken';
import { getLogger, LogCategories } from '../../../common/logger';
import { text2Chunks } from '../../../worker/function';

const logger = getLogger(LogCategories.MODULE.AI.RERANK);

type PostReRankResponse = {
  id: string;
  results: {
    index: number;
    relevance_score: number;
  }[];
  meta?: {
    tokens: {
      input_tokens: number;
      output_tokens: number;
    };
  };
};
type ReRankCallResult = {
  results: { id: string; score?: number }[];
  inputTokens: number;
};

export async function reRankRecall({
  model = getDefaultRerankModel(),
  query,
  documents,
  headers
}: {
  model?: RerankModelItemType;
  query: string;
  documents: { id: string; text: string }[];
  headers?: Record<string, string>;
}): Promise<ReRankCallResult> {
  if (!model) {
    return Promise.reject(new Error('No rerank model'));
  }
  if (documents.length === 0) {
    return Promise.resolve({
      results: [],
      inputTokens: 0
    });
  }

  // Token budget: calculate how many tokens each document can use
  // Document max token = ModelMaxToken - QueryTokens
  const queryTokens = await countPromptTokens(query);
  const rerankMaxToken = model.maxToken || 8000;
  const docBudget = rerankMaxToken - queryTokens;
  if (docBudget <= 500) {
    return Promise.reject(new Error('Rerank query too long'));
  }

  const chunkIdToDocIdMap: Map<string, string> = new Map();

  // Expand documents: split docs that exceed the budget into chunks (parallel)
  const expandedDocuments: { id: string; text: string }[] = (
    await Promise.all(
      documents.map(async (doc) => {
        const text = doc.text.trim();
        if (!text) return [];

        const docTokens = await countPromptTokens(text);
        if (docTokens <= docBudget) {
          chunkIdToDocIdMap.set(doc.id, doc.id);
          return [{ id: doc.id, text }];
        }
        // Estimate chunkSize in chars using the doc's char/token ratio with a 0.9 safety factor
        // to keep each chunk's token count within docBudget
        const chunkSize = Math.floor((text.length / docTokens) * docBudget * 0.9);
        const { chunks } = await text2Chunks({ text, chunkSize, overlapRatio: 0 });
        return chunks.map((chunkText, i) => {
          const chunkId = `${doc.id}__chunk_${i}`;
          chunkIdToDocIdMap.set(chunkId, doc.id);
          return { id: chunkId, text: chunkText };
        });
      })
    )
  ).flat();

  if (expandedDocuments.length === 0) {
    return { results: [], inputTokens: 0 };
  }

  // documentsTextArray 要跟 expandedDocuments 的顺序一致
  const documentsTextArray = expandedDocuments.map((doc) => doc.text);

  const { baseUrl, authorization } = getAxiosConfig();
  const start = Date.now();

  const requestUrl = model.requestUrl ? model.requestUrl : `${baseUrl}/rerank`;
  const apiResult = await axios
    .post<PostReRankResponse>(
      requestUrl,
      {
        model: model.model,
        query,
        documents: documentsTextArray
      },
      {
        headers: {
          Authorization: model.requestAuth ? `Bearer ${model.requestAuth}` : authorization,
          ...headers
        },
        timeout: 30000
      }
    )
    .then((res) => res.data)
    .then(async (data) => {
      if (!data?.results || data?.results?.length === 0) {
        logger.error('Rerank returned empty results', { data });
        return {
          results: [],
          inputTokens: 0
        };
      }

      const time = Date.now() - start;
      if (time > 2000) {
        logger.info('Rerank completed', { durationMs: time });
      }

      const existsId = new Set<string>();
      const results: {
        id: string;
        score: number;
      }[] = [];

      data.results.forEach((item) => {
        const chunkId = expandedDocuments[item.index].id;
        const docId = chunkIdToDocIdMap.get(chunkId);
        // 因为 data.results 是从高到低的，如果高分的同一个docId，则低分的不用处理
        if (!docId || existsId.has(docId)) return;
        existsId.add(docId);
        results.push({
          id: docId,
          score: item.relevance_score
        });
      });

      return {
        results,
        inputTokens:
          data?.meta?.tokens?.input_tokens ||
          (await countPromptTokens(documentsTextArray.join('\n') + query, ''))
      };
    })
    .catch((err) => {
      logger.error('Rerank request failed', { error: err });
      return Promise.reject(err);
    });

  return {
    results: apiResult.results,
    inputTokens: apiResult.inputTokens
  };
}
