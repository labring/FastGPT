import { describe, test, expect } from 'vitest';
import { computeRankingMetrics } from '@fastgpt/service/core/train/common/metrics/rankingMetrics';

describe('computeRankingMetrics', () => {
  describe('MRR 计算', () => {
    test('命中排名第 1: MRR = 1.0', () => {
      const result = computeRankingMetrics(
        [{ rankedIds: ['doc1', 'doc2', 'doc3'], expectedIds: ['doc1'] }],
        [10],
        'embed'
      );
      expect(result.detailed_results['embed_top10_mrr']).toBeCloseTo(1.0, 4);
    });

    test('命中排名第 2: MRR = 0.5', () => {
      const result = computeRankingMetrics(
        [{ rankedIds: ['doc_other', 'doc1', 'doc3'], expectedIds: ['doc1'] }],
        [10],
        'embed'
      );
      expect(result.detailed_results['embed_top10_mrr']).toBeCloseTo(0.5, 4);
    });

    test('命中排名第 3: MRR = 1/3', () => {
      const result = computeRankingMetrics(
        [{ rankedIds: ['doc_x', 'doc_y', 'doc1'], expectedIds: ['doc1'] }],
        [10],
        'embed'
      );
      expect(result.detailed_results['embed_top10_mrr']).toBeCloseTo(1 / 3, 4);
    });

    test('未命中: MRR = 0', () => {
      const result = computeRankingMetrics(
        [{ rankedIds: ['doc_x', 'doc_y', 'doc_z'], expectedIds: ['doc_not_in_list'] }],
        [10],
        'embed'
      );
      expect(result.detailed_results['embed_top10_mrr']).toBe(0);
    });

    test('多个 case 时取平均值', () => {
      // case1: rank=1 → 1.0, case2: rank=2 → 0.5, 平均=0.75
      const result = computeRankingMetrics(
        [
          { rankedIds: ['doc1', 'doc2'], expectedIds: ['doc1'] },
          { rankedIds: ['doc_x', 'doc1'], expectedIds: ['doc1'] }
        ],
        [10],
        'embed'
      );
      expect(result.detailed_results['embed_top10_mrr']).toBeCloseTo(0.75, 4);
    });

    test('k 截断：超过 k 的命中不算', () => {
      // doc1 在排名第 6，k=5 时不算命中
      const result = computeRankingMetrics(
        [{ rankedIds: ['a', 'b', 'c', 'd', 'e', 'doc1'], expectedIds: ['doc1'] }],
        [5],
        'embed'
      );
      expect(result.detailed_results['embed_top5_mrr']).toBe(0);
    });

    test('多个 expectedIds 时取第一个命中的倒数排名', () => {
      // doc1 在第 3 位，doc2 在第 1 位 → MRR = 1.0（因为 doc2 先命中）
      const result = computeRankingMetrics(
        [{ rankedIds: ['doc2', 'x', 'doc1'], expectedIds: ['doc1', 'doc2'] }],
        [10],
        'embed'
      );
      expect(result.detailed_results['embed_top10_mrr']).toBeCloseTo(1.0, 4);
    });
  });

  describe('NDCG 计算', () => {
    test('完美排序: NDCG = 1.0', () => {
      // expected doc 在第 1 位
      const result = computeRankingMetrics(
        [{ rankedIds: ['doc1', 'doc2', 'doc3'], expectedIds: ['doc1'] }],
        [5],
        'embed'
      );
      expect(result.detailed_results['embed_top5_ndcg']).toBeCloseTo(1.0, 4);
    });

    test('未命中: NDCG = 0', () => {
      const result = computeRankingMetrics(
        [{ rankedIds: ['doc_x', 'doc_y', 'doc_z'], expectedIds: ['doc_not_here'] }],
        [5],
        'embed'
      );
      expect(result.detailed_results['embed_top5_ndcg']).toBe(0);
    });

    test('排名越靠前 NDCG 越高', () => {
      // rank=1 vs rank=3
      const rank1 = computeRankingMetrics(
        [{ rankedIds: ['doc1', 'x', 'y'], expectedIds: ['doc1'] }],
        [5],
        'embed'
      );
      const rank3 = computeRankingMetrics(
        [{ rankedIds: ['x', 'y', 'doc1'], expectedIds: ['doc1'] }],
        [5],
        'embed'
      );
      expect(rank1.detailed_results['embed_top5_ndcg']).toBeGreaterThan(
        rank3.detailed_results['embed_top5_ndcg']!
      );
    });
  });

  describe('MAP 计算', () => {
    test('单个 expected doc 在第 1 位: MAP = 1.0', () => {
      const result = computeRankingMetrics(
        [{ rankedIds: ['doc1', 'doc2'], expectedIds: ['doc1'] }],
        [10],
        'embed'
      );
      expect(result.detailed_results['embed_top10_map']).toBeCloseTo(1.0, 4);
    });

    test('2 个 expected docs 均命中: MAP 计算', () => {
      // doc1 在 rank 1, doc2 在 rank 2
      // AP = (1/1 + 2/2) / 2 = 1.0
      const result = computeRankingMetrics(
        [{ rankedIds: ['doc1', 'doc2'], expectedIds: ['doc1', 'doc2'] }],
        [10],
        'embed'
      );
      expect(result.detailed_results['embed_top10_map']).toBeCloseTo(1.0, 4);
    });

    test('未命中时 MAP = 0', () => {
      const result = computeRankingMetrics(
        [{ rankedIds: ['x', 'y'], expectedIds: ['doc_not_here'] }],
        [10],
        'embed'
      );
      expect(result.detailed_results['embed_top10_map']).toBe(0);
    });
  });

  describe('Precision 计算', () => {
    test('有命中时 precision > 0', () => {
      const result = computeRankingMetrics(
        [{ rankedIds: ['doc1', 'doc2'], expectedIds: ['doc1'] }],
        [5],
        'embed'
      );
      expect(result.detailed_results['embed_top5_precision']).toBeGreaterThan(0);
    });

    test('无命中时 precision = 0', () => {
      const result = computeRankingMetrics(
        [{ rankedIds: ['x', 'y'], expectedIds: ['doc_not_here'] }],
        [5],
        'embed'
      );
      expect(result.detailed_results['embed_top5_precision']).toBe(0);
    });

    test('k 截断下命中率', () => {
      // doc1 在 rank=1，k=5: precision=1.0
      const result = computeRankingMetrics(
        [{ rankedIds: ['doc1', 'x', 'y'], expectedIds: ['doc1'] }],
        [5],
        'embed'
      );
      expect(result.detailed_results['embed_top5_precision']).toBeCloseTo(1.0, 4);
    });
  });

  describe('返回结构', () => {
    test('返回所有 k 值的 detailed_results', () => {
      const result = computeRankingMetrics(
        [{ rankedIds: ['doc1'], expectedIds: ['doc1'] }],
        [5, 10, 15, 20],
        'embed'
      );

      expect(result.detailed_results['embed_top5_mrr']).toBeDefined();
      expect(result.detailed_results['embed_top10_mrr']).toBeDefined();
      expect(result.detailed_results['embed_top15_mrr']).toBeDefined();
      expect(result.detailed_results['embed_top20_mrr']).toBeDefined();
      expect(result.detailed_results['embed_top5_ndcg']).toBeDefined();
      expect(result.detailed_results['embed_top5_map']).toBeDefined();
      expect(result.detailed_results['embed_top5_precision']).toBeDefined();
      expect(result.detailed_results['overall_mrr']).toBeDefined();
      expect(result.detailed_results['overall_ndcg']).toBeDefined();
      expect(result.detailed_results['overall_map']).toBeDefined();
      expect(result.detailed_results['overall_precision']).toBeDefined();
    });

    test('prefix 影响 detailed_results 的键名', () => {
      const embedResult = computeRankingMetrics(
        [{ rankedIds: ['doc1'], expectedIds: ['doc1'] }],
        [5],
        'embed'
      );
      const rerankResult = computeRankingMetrics(
        [{ rankedIds: ['doc1'], expectedIds: ['doc1'] }],
        [5],
        'rerank'
      );

      expect(embedResult.detailed_results['embed_top5_mrr']).toBeDefined();
      expect(rerankResult.detailed_results['rerank_top5_mrr']).toBeDefined();
      // 键名互不干扰
      expect(embedResult.detailed_results['rerank_top5_mrr']).toBeUndefined();
      expect(rerankResult.detailed_results['embed_top5_mrr']).toBeUndefined();
    });

    test('返回 retrieval_ranks（每条 query 每个 expected doc 的排名，未命中为 -1）', () => {
      const result = computeRankingMetrics(
        [
          { rankedIds: ['doc1', 'doc2', 'doc3'], expectedIds: ['doc2'] },
          { rankedIds: ['a', 'b'], expectedIds: ['not_here', 'b'] }
        ],
        [10],
        'embed'
      );

      expect(result.retrieval_ranks).toBeDefined();
      expect(result.retrieval_ranks.length).toBe(2);
      // case1: doc2 在 rank=2
      expect(result.retrieval_ranks[0]).toEqual([2]);
      // case2: not_here=-1, b=rank2
      expect(result.retrieval_ranks[1]).toEqual([-1, 2]);
    });

    test('返回 mrr_scores / ndcg_scores / map_scores（每条 query 的分数）', () => {
      const result = computeRankingMetrics(
        [
          { rankedIds: ['doc1', 'x'], expectedIds: ['doc1'] },
          { rankedIds: ['x', 'doc1'], expectedIds: ['doc1'] }
        ],
        [5, 10],
        'embed'
      );

      expect(result.mrr_scores).toBeDefined();
      expect(result.ndcg_scores).toBeDefined();
      expect(result.map_scores).toBeDefined();
      // 每个 score 数组长度 = case 数
      expect(result.mrr_scores['mrr@5'].length).toBe(2);
      expect(result.ndcg_scores['ndcg@10'].length).toBe(2);
    });

    test('返回 total_rows 和 expect_count', () => {
      const result = computeRankingMetrics(
        [
          { rankedIds: ['doc1'], expectedIds: ['doc1'] },
          { rankedIds: ['doc2'], expectedIds: ['doc2'] }
        ],
        [10],
        'embed'
      );

      expect(result.total_rows).toBe(2);
      expect(result.expect_count).toBe(2);
    });

    test('空 cases 返回 0 指标', () => {
      const result = computeRankingMetrics([], [5, 10], 'embed');

      expect(result.total_rows).toBe(0);
      expect(result.detailed_results['embed_top5_mrr']).toBe(0);
    });
  });

  describe('top-k 降级规律（k 越大指标应 >= 小 k）', () => {
    test('MRR@10 >= MRR@5（更宽松的 k 分数不会更低）', () => {
      const result = computeRankingMetrics(
        Array.from({ length: 20 }, (_, i) => ({
          rankedIds: Array.from({ length: 15 }, (_, j) => `doc_${j}`),
          expectedIds: [`doc_${i % 15}`]
        })),
        [5, 10],
        'embed'
      );
      expect(result.detailed_results['embed_top10_mrr']).toBeGreaterThanOrEqual(
        result.detailed_results['embed_top5_mrr']!
      );
    });
  });

  describe('overall_* 指标对齐 DiTing（所有 K 值展平均值）', () => {
    test('overall_mrr = 所有 K 值 MRR 展平后的均值', () => {
      // doc1 在 rank=8：MRR@5=0, MRR@10=1/8, MRR@15=1/8, MRR@20=1/8
      // overall = (0 + 1/8 + 1/8 + 1/8) / 4 = 0.09375
      // 旧行为（maxK=15）: overall = (0+1/8+1/8)/3 ≈ 0.0833
      const rankedIds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'doc1', 'x', 'y'];
      const result = computeRankingMetrics(
        [{ rankedIds, expectedIds: ['doc1'] }],
        [5, 10, 15, 20],
        'embed'
      );

      const expected = (0 + 1 / 8 + 1 / 8 + 1 / 8) / 4;
      expect(result.detailed_results['overall_mrr']).toBeCloseTo(expected, 4);
      // overall_mrr 必须小于 MRR@20（因为 MRR@5=0 拉低了均值）
      expect(result.detailed_results['overall_mrr']).toBeLessThan(
        result.detailed_results['embed_top20_mrr']!
      );
    });

    test('单 K 值时 overall_mrr 等于该 K 的 MRR', () => {
      const result = computeRankingMetrics(
        [{ rankedIds: ['x', 'doc1'], expectedIds: ['doc1'] }],
        [10],
        'embed'
      );
      expect(result.detailed_results['overall_mrr']).toBeCloseTo(
        result.detailed_results['embed_top10_mrr']!,
        6
      );
    });

    test('多 query 时 overall_mrr = 所有 K×query 分数的总均值', () => {
      // query1: doc 在 rank 1 → MRR@5=1, MRR@10=1, MRR@15=1, MRR@20=1
      // query2: doc 在 rank 8 → MRR@5=0, MRR@10=1/8, MRR@15=1/8, MRR@20=1/8
      // overall = (1+1+1+1+0+1/8+1/8+1/8) / 8 = (4 + 3/8) / 8 = 4.375/8 ≈ 0.5469
      const result = computeRankingMetrics(
        [
          { rankedIds: ['doc1', 'x', 'y'], expectedIds: ['doc1'] },
          { rankedIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'doc1'], expectedIds: ['doc1'] }
        ],
        [5, 10, 15, 20],
        'embed'
      );

      const expected = (1 + 1 + 1 + 1 + 0 + 1 / 8 + 1 / 8 + 1 / 8) / 8;
      expect(result.detailed_results['overall_mrr']).toBeCloseTo(expected, 4);
    });
  });
});
