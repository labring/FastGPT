import { getDatasetSynonymRuntimeConfig, isDatasetSynonymEnabled } from './entity';
import { reRankRecall } from '../../ai/rerank';
import type { RerankModelDataType } from '@fastgpt/global/core/ai/model/schema';

type RerankDocument = { id: string; text: string; datasetId: string };

export const prepareDatasetSynonymRerank = async ({
  teamId,
  query,
  documents
}: {
  teamId?: string;
  query: string;
  documents: RerankDocument[];
}) => {
  if (!teamId || !isDatasetSynonymEnabled() || documents.length === 0)
    return [{ query, documents }];

  const datasetIds = [...new Set(documents.map((document) => document.datasetId).filter(Boolean))];
  const runtimes = new Map(
    await Promise.all(
      datasetIds.map(async (datasetId) => {
        try {
          return [datasetId, await getDatasetSynonymRuntimeConfig({ teamId, datasetId })] as const;
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
      const transformedQuery =
        normalizedQueries.get(document.datasetId) ?? matcher.transform(query).transformedText;
      normalizedQueries.set(document.datasetId, transformedQuery);
      if (Array.from(transformedQuery).length <= 4096) {
        // Local bge-reranker-v2-m3 smoke test (2026-10-15): “洋柿子有什么营养？”
        // scored 0.145 before and 0.952 after replacing both sides with “番茄”.
        // This is evidence for the alias-mismatch case only, not a guarantee that
        // every query improves; keep the original text outside this temporary call.
        normalizedQuery = transformedQuery;
        const text = matcher.transform(document.text).transformedText;
        if (text !== document.text) normalizedDocument = { ...document, text };
      }
    }
    const group = groups.get(normalizedQuery) ?? { query: normalizedQuery, documents: [] };
    group.documents.push(normalizedDocument);
    groups.set(normalizedQuery, group);
  }
  return [...groups.values()];
};

export const rerankDatasetWithSynonyms = async ({
  model,
  ...props
}: Parameters<typeof prepareDatasetSynonymRerank>[0] & { model?: RerankModelDataType }) => {
  const baseline = await reRankRecall({
    model,
    query: props.query,
    documents: props.documents.map(({ id, text }) => ({ id, text }))
  });
  if (!props.teamId || !isDatasetSynonymEnabled() || props.documents.length === 0) return baseline;

  let groups: Awaited<ReturnType<typeof prepareDatasetSynonymRerank>>;
  try {
    groups = await prepareDatasetSynonymRerank(props);
  } catch {
    return baseline;
  }
  const originalTexts = new Map(props.documents.map(({ id, text }) => [id, text]));
  const changedGroups = groups
    .map(({ query, documents }) => ({
      query,
      documents: documents.filter(
        (document) => query !== props.query || document.text !== originalTexts.get(document.id)
      )
    }))
    .filter(({ documents }) => documents.length > 0);
  if (changedGroups.length === 0) return baseline;

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
  // Keep each successful original score as a floor; synonym failures must not erase it.
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
