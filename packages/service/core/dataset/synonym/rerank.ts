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
  documents,
  onSynonymRerankResult
}: {
  model?: RerankModelDataType;
  teamId: string;
  query: string;
  documents: RerankDocument[];
  onSynonymRerankResult?: (result: { triggered: boolean; failed: boolean }) => void;
}) => {
  const baselinePromise = reRankRecall({
    model,
    query,
    documents: documents.map(({ id, text }) => ({ id, text }))
  });
  if (!serviceEnv.DATASET_SYNONYM_ENABLED || documents.length === 0) return baselinePromise;

  /** 按知识库读取当前规则并按转换后的问题分组；单个知识库配置读取异常时标记降级并保留原文输入。 */
  const prepareRerankGroups = async () => {
    const datasetIds = [
      ...new Set(documents.map((document) => document.datasetId).filter(Boolean))
    ];
    let configLoadFailed = false;
    const runtimes = new Map(
      await Promise.all(
        datasetIds.map(async (datasetId) => {
          try {
            return [
              datasetId,
              await getDatasetSynonymRuntimeConfig({ teamId, datasetId })
            ] as const;
          } catch {
            configLoadFailed = true;
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
    return {
      groups: [...groups.values()],
      configLoadFailed
    };
  };

  // 1. 准备阶段只读配置并构造临时文本，与基线 rerank 并行执行，避免串行叠加延迟。
  let prepareFailed = false;
  const preparedPromise = prepareRerankGroups().catch(() => {
    prepareFailed = true;
    return undefined;
  });
  const baseline = await baselinePromise;
  const prepared = await preparedPromise;
  if (!prepared) {
    if (prepareFailed) {
      onSynonymRerankResult?.({ triggered: false, failed: true });
    }
    return baseline;
  }

  const { groups, configLoadFailed } = prepared;

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
  if (changedGroups.length === 0) {
    if (configLoadFailed) {
      onSynonymRerankResult?.({ triggered: false, failed: true });
    }
    return baseline;
  }

  // 3. 执行第二路重排，单组抛错或模型返回空打分均视作静默降级，保留基线分数并通过回调上报。
  let secondPassFailed = false;
  const responses = await Promise.all(
    changedGroups.map(async ({ query, documents }) => {
      try {
        const res = await reRankRecall({
          model,
          query,
          documents: documents.map(({ id, text }) => ({ id, text }))
        });
        if (documents.length > 0 && res.results.length === 0) {
          secondPassFailed = true;
        }
        return res;
      } catch {
        secondPassFailed = true;
        return { results: [], inputTokens: 0 };
      }
    })
  );
  onSynonymRerankResult?.({ triggered: true, failed: configLoadFailed || secondPassFailed });

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
