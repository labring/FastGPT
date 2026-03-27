import { POST } from '../../../common/api/serverRequest';
import { getDefaultRerankModel } from '../model';
import { getAxiosConfig } from '../config';
import { type RerankModelItemType } from '@fastgpt/global/core/ai/model.schema';
import { countPromptTokens } from '../../../common/string/tiktoken';
import { getLogger, LogCategories } from '../../../common/logger';
import { splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';

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
    return Promise.reject('No rerank model');
  }
  if (documents.length === 0) {
    return Promise.resolve({
      results: [],
      inputTokens: 0
    });
  }

  // Token budget: calculate how many tokens each document can use
  const queryTokens = await countPromptTokens(query);
  const rerankMaxToken = model.maxToken ?? 8000;
  const docBudget = rerankMaxToken - queryTokens;
  if (docBudget <= 0) {
    return Promise.reject(new Error('Rerank query too long'));
  }

  // Expand documents: split docs that exceed the budget into chunks (parallel)
  const expandedDocuments: { id: string; parentId: string; text: string }[] = (
    await Promise.all(
      documents.map(async (doc) => {
        const text = doc.text.trim();
        if (!text) return [];

        const docTokens = await countPromptTokens(text);
        if (docTokens <= docBudget) {
          return [{ id: doc.id, parentId: doc.id, text }];
        }
        // Use the document's own char/token ratio with a 0.9 safety factor to
        const chunkSize = Math.floor((text.length / docTokens) * docBudget * 0.9);
        const { chunks } = splitText2Chunks({ text, chunkSize, overlapRatio: 0 });
        const finalChunks = chunks.map((c) => c.trim()).filter(Boolean);
        return finalChunks.map((chunkText, i) => ({
          id: `${doc.id}__chunk_${i}`,
          parentId: doc.id,
          text: chunkText
        }));
      })
    )
  ).flat();

  if (expandedDocuments.length === 0) {
    return Promise.resolve({ results: [], inputTokens: 0 });
  }

  const { baseUrl, authorization } = getAxiosConfig();
  const start = Date.now();
  const documentsTextArray = expandedDocuments.map((doc) => doc.text);
  const chunkToParent = new Map(expandedDocuments.map((doc) => [doc.id, doc.parentId]));

  const apiResult = await POST<PostReRankResponse>(
    model.requestUrl ? model.requestUrl : `${baseUrl}/rerank`,
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
    .then(async (data) => {
      logger.info('Rerank completed', { durationMs: Date.now() - start });

      if (!data?.results || data?.results?.length === 0) {
        logger.error('Rerank returned empty results', { data });
      }

      return {
        results: data?.results?.map((item) => ({
          id: expandedDocuments[item.index].id,
          score: item.relevance_score
        })),
        inputTokens:
          data?.meta?.tokens?.input_tokens ||
          (await countPromptTokens(documentsTextArray.join('\n') + query, ''))
      };
    })
    .catch((err) => {
      logger.error('Rerank request failed', { error: err });

      return Promise.reject(err);
    });

  // Aggregate chunk scores back to original document IDs (keep max score per parent)
  const parentScoreMap = new Map<string, number>();
  apiResult.results.forEach((item) => {
    const parentId = chunkToParent.get(item.id) ?? item.id;
    const score = item.score ?? 0;
    const oldScore = parentScoreMap.get(parentId);
    if (oldScore === undefined || score > oldScore) {
      parentScoreMap.set(parentId, score);
    }
  });

  return {
    results: Array.from(parentScoreMap.entries()).map(([id, score]) => ({ id, score })),
    inputTokens: apiResult.inputTokens
  };
}
