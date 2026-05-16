export type RankingCase = {
  rankedIds: string[]; // ordered document ID list returned by the model
  expectedIds: string[]; // expected matching document ID list
};

export type RankingMetricsResult = {
  detailed_results: Record<string, number>;
  mrr_scores: Record<string, number[]>;
  ndcg_scores: Record<string, number[]>;
  map_scores: Record<string, number[]>;
  precision_scores: Record<string, number[]>;
  retrieval_ranks: number[][];
  total_rows: number;
  expect_count: number;
};

const DEFAULT_K_VALUES = [5, 10, 15];

/**
 * Compute retrieval/reranking evaluation metrics (shared by embedding and rerank)
 *
 * @param cases     Ordered document ID list + expected hit list for each query
 * @param kValues   Top-k values to evaluate, defaults to [5, 10, 15]
 * @param prefix    Metric key prefix: 'embed' for embedding, 'rerank' for rerank
 */
export function computeRankingMetrics(
  cases: RankingCase[],
  kValues: number[] = DEFAULT_K_VALUES,
  prefix: string = 'embed'
): RankingMetricsResult {
  if (cases.length === 0) {
    const detailedResults: Record<string, number> = {};
    for (const k of kValues) {
      detailedResults[`${prefix}_top${k}_mrr`] = 0;
      detailedResults[`${prefix}_top${k}_ndcg`] = 0;
      detailedResults[`${prefix}_top${k}_map`] = 0;
      detailedResults[`${prefix}_top${k}_precision`] = 0;
    }
    detailedResults['overall_mrr'] = 0;
    detailedResults['overall_ndcg'] = 0;
    detailedResults['overall_map'] = 0;
    detailedResults['overall_precision'] = 0;

    return {
      detailed_results: detailedResults,
      mrr_scores: Object.fromEntries(kValues.map((k) => [`mrr@${k}`, []])),
      ndcg_scores: Object.fromEntries(kValues.map((k) => [`ndcg@${k}`, []])),
      map_scores: Object.fromEntries(kValues.map((k) => [`map@${k}`, []])),
      precision_scores: Object.fromEntries(kValues.map((k) => [`precision@${k}`, []])),
      retrieval_ranks: [],
      total_rows: 0,
      expect_count: 0
    };
  }

  // Per-query metric scores for each k value
  const mrrPerCase: Record<number, number[]> = {};
  const ndcgPerCase: Record<number, number[]> = {};
  const mapPerCase: Record<number, number[]> = {};
  const precisionPerCase: Record<number, number[]> = {};
  for (const k of kValues) {
    mrrPerCase[k] = [];
    ndcgPerCase[k] = [];
    mapPerCase[k] = [];
    precisionPerCase[k] = [];
  }

  // retrieval_ranks per query: rank of each expectedId in the full ranked list (1-based, -1 if not found)
  const retrievalRanks: number[][] = [];

  for (const c of cases) {
    const expectedSet = new Set(c.expectedIds);

    // Compute rank for each expectedId
    const caseRanks = c.expectedIds.map((eid) => {
      const idx = c.rankedIds.indexOf(eid);
      return idx === -1 ? -1 : idx + 1; // 1-based
    });
    retrievalRanks.push(caseRanks);

    for (const k of kValues) {
      const topK = c.rankedIds.slice(0, k);

      mrrPerCase[k].push(calcMRR(topK, expectedSet));
      ndcgPerCase[k].push(calcNDCG(topK, expectedSet));
      mapPerCase[k].push(calcAP(topK, expectedSet, c.expectedIds.length));
      precisionPerCase[k].push(calcPrecision(topK, expectedSet, c.expectedIds.length));
    }
  }

  // Aggregate
  const detailed_results: Record<string, number> = {};
  const mrr_scores: Record<string, number[]> = {};
  const ndcg_scores: Record<string, number[]> = {};
  const map_scores: Record<string, number[]> = {};
  const precision_scores: Record<string, number[]> = {};

  for (const k of kValues) {
    detailed_results[`${prefix}_top${k}_mrr`] = mean(mrrPerCase[k]);
    detailed_results[`${prefix}_top${k}_ndcg`] = mean(ndcgPerCase[k]);
    detailed_results[`${prefix}_top${k}_map`] = mean(mapPerCase[k]);
    detailed_results[`${prefix}_top${k}_precision`] = mean(precisionPerCase[k]);

    mrr_scores[`mrr@${k}`] = mrrPerCase[k];
    ndcg_scores[`ndcg@${k}`] = ndcgPerCase[k];
    map_scores[`map@${k}`] = mapPerCase[k];
    precision_scores[`precision@${k}`] = precisionPerCase[k];
  }

  // Overall: flatten all per-query scores across all K values (matches DiTing behavior)
  // DiTing extends all column scores into a single list and averages them,
  // rather than using only the max-K column.
  const allMrr = kValues.flatMap((k) => mrrPerCase[k]);
  const allNdcg = kValues.flatMap((k) => ndcgPerCase[k]);
  const allMap = kValues.flatMap((k) => mapPerCase[k]);
  const allPrecision = kValues.flatMap((k) => precisionPerCase[k]);
  detailed_results['overall_mrr'] = mean(allMrr);
  detailed_results['overall_ndcg'] = mean(allNdcg);
  detailed_results['overall_map'] = mean(allMap);
  detailed_results['overall_precision'] = mean(allPrecision);

  return {
    detailed_results,
    mrr_scores,
    ndcg_scores,
    map_scores,
    precision_scores,
    retrieval_ranks: retrievalRanks,
    total_rows: cases.length,
    expect_count: cases.filter((c) => c.expectedIds.length > 0).length
  };
}

/** Mean Reciprocal Rank */
function calcMRR(topK: string[], expectedSet: Set<string>): number {
  for (let i = 0; i < topK.length; i++) {
    if (expectedSet.has(topK[i])) return 1 / (i + 1);
  }
  return 0;
}

/** Normalized Discounted Cumulative Gain */
function calcNDCG(topK: string[], expectedSet: Set<string>): number {
  const relevances = topK.map((id) => (expectedSet.has(id) ? 1 : 0));
  const dcg = calcDCG(relevances);
  // Ideal case: all relevant docs ranked at the top
  const idealRelevances = Array(Math.min(expectedSet.size, topK.length)).fill(1);
  const idcg = calcDCG(idealRelevances);
  return idcg === 0 ? 0 : dcg / idcg;
}

function calcDCG(relevances: number[]): number {
  return relevances.reduce((sum, rel, i) => {
    return sum + (i === 0 ? rel : rel / Math.log2(i + 2));
  }, 0);
}

/** Average Precision */
function calcAP(topK: string[], expectedSet: Set<string>, totalExpected: number): number {
  if (totalExpected === 0) return 0;
  let hitCount = 0;
  let sumPrecision = 0;
  for (let i = 0; i < topK.length; i++) {
    if (expectedSet.has(topK[i])) {
      hitCount++;
      sumPrecision += hitCount / (i + 1);
    }
  }
  return hitCount === 0 ? 0 : sumPrecision / totalExpected;
}

/** Precision: fraction of expectedIds found in topK */
function calcPrecision(topK: string[], expectedSet: Set<string>, totalExpected: number): number {
  if (totalExpected === 0) return 0;
  const hits = topK.filter((id) => expectedSet.has(id)).length;
  return hits / totalExpected;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}
