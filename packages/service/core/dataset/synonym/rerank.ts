import { getDatasetSynonymRuntimeConfig } from './entity';
import { reRankRecall } from '../../ai/rerank';
import type { RerankModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { serviceEnv } from '../../../env';

type RerankDocument = { id: string; text: string; datasetId: string };

/**
 * 对原始文本和按知识库规则标准化的临时文本分别重排，逐条保留较高分。
 * 同义词准备或次路重排失败时保留基线；基线失败向上抛出，成功请求的 token 累加用于计费。
 */
export const rerankDatasetWithSynonyms = async ({
  model,
  teamId,
  query,
  documents
}: {
  model?: RerankModelDataType;
  teamId: string;
  query: string;
  documents: RerankDocument[];
}) => {
  const baselinePromise = reRankRecall({
    model,
    query,
    documents: documents.map(({ id, text }) => ({ id, text }))
  });
  if (!serviceEnv.DATASET_SYNONYM_ENABLED || documents.length === 0) return baselinePromise;

  /** 按知识库读取当前规则并按转换后的问题分组；某个知识库配置不可用时保留其原文输入。 */
  const prepareRerankGroups = async () => {
    const datasetIds = [
      ...new Set(documents.map((document) => document.datasetId).filter(Boolean))
    ];
    const runtimes = new Map(
      await Promise.all(
        datasetIds.map(async (datasetId) => {
          try {
            return [
              datasetId,
              await getDatasetSynonymRuntimeConfig({ teamId, datasetId })
            ] as const;
          } catch {
            return [datasetId, null] as const;
          }
        })
      )
    );
    const groups = new Map<string, { query: string; documents: RerankDocument[] }>();
    const normalizedQueries = new Map<string, string>();
    for (const document of documents) {
      const matcher = runtimes.get(document.datasetId)?.active?.matcher;
      let normalizedQuery = query;
      let normalizedDocument = document;
      if (matcher) {
        // 转换只用于临时重排输入，不改写原始问题和分块正文。
        const transformedQuery =
          normalizedQueries.get(document.datasetId) ?? matcher.transform(query).transformedText;
        normalizedQueries.set(document.datasetId, transformedQuery);
        normalizedQuery = transformedQuery;
        const text = matcher.transform(document.text).transformedText;
        if (text !== document.text) normalizedDocument = { ...document, text };
      }
      const group = groups.get(normalizedQuery) ?? { query: normalizedQuery, documents: [] };
      group.documents.push(normalizedDocument);
      groups.set(normalizedQuery, group);
    }
    return [...groups.values()];
  };

  // 1. 准备阶段只读配置并构造临时文本，与基线 rerank 并行执行，避免串行叠加延迟。
  const groupsPromise = prepareRerankGroups().catch(() => undefined);
  const baseline = await baselinePromise;
  const groups = await groupsPromise;
  if (!groups) return baseline;

  // 2. 筛选出转换后 query 或分块文本发生变化的分组（query 命中同义词时该组全部候选重打分）。
  const originalTexts = new Map(documents.map(({ id, text }) => [id, text]));
  const changedGroups = groups
    .map(({ query: normalizedQuery, documents: groupDocuments }) => ({
      query: normalizedQuery,
      documents: groupDocuments.filter(
        (document) => normalizedQuery !== query || document.text !== originalTexts.get(document.id)
      )
    }))
    .filter(({ documents }) => documents.length > 0);
  if (changedGroups.length === 0) return baseline;

  // 3. 执行第二路重排，单组失败降级为空结果，不影响基线分数。
  const responses = await Promise.all(
    changedGroups.map(async ({ query, documents }) => {
      try {
        return await reRankRecall({
          model,
          query,
          documents: documents.map(({ id, text }) => ({ id, text }))
        });
      } catch {
        return { results: [], inputTokens: 0 };
      }
    })
  );

  // 4. 以基线分数为下限逐条保留较高分，并累加两路成功请求的 inputTokens。
  const merged = new Map(baseline.results.map((result) => [result.id, result]));
  for (const response of responses) {
    for (const result of response.results) {
      const original = merged.get(result.id);
      if (
        originalTexts.has(result.id) &&
        typeof result.score === 'number' &&
        Number.isFinite(result.score) &&
        result.score > (original?.score ?? -Infinity)
      ) {
        merged.set(result.id, result);
      }
    }
  }

  return {
    results: [...merged.values()].sort((left, right) => (right.score ?? 0) - (left.score ?? 0)),
    inputTokens:
      baseline.inputTokens + responses.reduce((total, response) => total + response.inputTokens, 0)
  };
};
