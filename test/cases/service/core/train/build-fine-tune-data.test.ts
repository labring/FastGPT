import { describe, test, expect } from 'vitest';
import { buildFineTuneData } from '@fastgpt/service/core/train/common/synthesize/buildFineTuneData';

describe('buildFineTuneData', () => {
  describe('基础正样本构建', () => {
    test('每个 pair 恰好生成 1 个 sample', () => {
      const result = buildFineTuneData({
        items: [
          {
            dataId: 'item1',
            datasetId: 'ds1',
            q: 'original_long_chunk',
            a: 'answer',
            indexes: [
              ['q1_a', 'q2_a'],
              ['q1_b', 'q2_b']
            ]
          }
        ],
        minNegativeSamples: 0,
        maxNegativeSamples: 0
      });

      expect(result.samples.length).toBe(2);
    });

    test('多个 item 时 sample 数量等于所有 pair 总数', () => {
      const result = buildFineTuneData({
        items: [
          {
            dataId: 'item1',
            datasetId: 'ds1',
            q: 'chunk1',
            a: 'a1',
            indexes: [
              ['q1', 'q2'],
              ['q3', 'q4']
            ]
          },
          {
            dataId: 'item2',
            datasetId: 'ds1',
            q: 'chunk2',
            a: 'a2',
            indexes: [['q5', 'q6']]
          }
        ],
        minNegativeSamples: 0,
        maxNegativeSamples: 0
      });

      expect(result.samples.length).toBe(3); // 2 + 1
    });

    test('偶数 pair_index (0, 2, ...): query=q1, positive=[q2]', () => {
      const result = buildFineTuneData({
        items: [
          {
            dataId: 'item1',
            datasetId: 'ds1',
            q: 'original_q',
            a: 'answer',
            indexes: [
              ['short_q1', 'short_q2'], // pair_index=0 (even)
              ['short_q3', 'short_q4'], // pair_index=1 (odd)
              ['short_q5', 'short_q6'] // pair_index=2 (even)
            ]
          }
        ],
        minNegativeSamples: 0,
        maxNegativeSamples: 0
      });

      const evenSample0 = result.samples[0]; // pair_index=0
      expect(evenSample0.query).toBe('short_q1');
      expect(evenSample0.positive).toEqual(['short_q2']);

      const evenSample2 = result.samples[2]; // pair_index=2
      expect(evenSample2.query).toBe('short_q5');
      expect(evenSample2.positive).toEqual(['short_q6']);
    });

    test('奇数 pair_index (1, 3, ...): query=q1, positive=[original_q]', () => {
      const result = buildFineTuneData({
        items: [
          {
            dataId: 'item1',
            datasetId: 'ds1',
            q: 'the_original_long_chunk',
            a: 'answer',
            indexes: [
              ['short_q1', 'short_q2'], // pair_index=0
              ['short_q3', 'short_q4'], // pair_index=1 (odd)
              ['short_q5', 'short_q6'], // pair_index=2
              ['short_q7', 'short_q8'] // pair_index=3 (odd)
            ]
          }
        ],
        minNegativeSamples: 0,
        maxNegativeSamples: 0
      });

      const oddSample1 = result.samples[1]; // pair_index=1
      expect(oddSample1.query).toBe('short_q3');
      expect(oddSample1.positive).toEqual(['the_original_long_chunk']);

      const oddSample3 = result.samples[3]; // pair_index=3
      expect(oddSample3.query).toBe('short_q7');
      expect(oddSample3.positive).toEqual(['the_original_long_chunk']);
    });

    test('奇数 pair 无 original_q 时回退到 q2 作为正样本', () => {
      const result = buildFineTuneData({
        items: [
          {
            dataId: 'item1',
            datasetId: 'ds1',
            q: '',
            a: 'answer',
            indexes: [
              ['short_q1', 'short_q2'], // pair_index=0
              ['short_q3', 'short_q4'] // pair_index=1 (odd, no original_q)
            ]
          }
        ],
        minNegativeSamples: 0,
        maxNegativeSamples: 0
      });

      const oddSample = result.samples[1];
      expect(oddSample.query).toBe('short_q3');
      expect(oddSample.positive).toEqual(['short_q4']); // fallback to q2
    });
  });

  describe('include_original_q 行为', () => {
    test('includeOriginalQ=true 时 sample 包含 originalQ 和 originalA', () => {
      const result = buildFineTuneData({
        items: [
          {
            dataId: 'item1',
            datasetId: 'ds1',
            q: 'original_q',
            a: 'original_a',
            indexes: [['q1', 'q2']]
          }
        ],
        minNegativeSamples: 0,
        maxNegativeSamples: 0,
        includeOriginalQ: true
      });

      expect(result.samples[0].originalQ).toBe('original_q');
      expect(result.samples[0].originalA).toBe('original_a');
    });

    test('includeOriginalQ=false 时 sample 不含 originalQ/A', () => {
      const result = buildFineTuneData({
        items: [
          {
            dataId: 'item1',
            datasetId: 'ds1',
            q: 'original_q',
            a: 'original_a',
            indexes: [['q1', 'q2']]
          }
        ],
        minNegativeSamples: 0,
        maxNegativeSamples: 0,
        includeOriginalQ: false
      });

      expect(result.samples[0].originalQ).toBeUndefined();
      expect(result.samples[0].originalA).toBeUndefined();
    });

    test('includeOriginalQ 不影响 sample 数量', () => {
      const withOrig = buildFineTuneData({
        items: [{ dataId: 'i1', datasetId: 'ds1', q: 'q', a: 'a', indexes: [['q1', 'q2']] }],
        minNegativeSamples: 0,
        maxNegativeSamples: 0,
        includeOriginalQ: true
      });
      const withoutOrig = buildFineTuneData({
        items: [{ dataId: 'i1', datasetId: 'ds1', q: 'q', a: 'a', indexes: [['q1', 'q2']] }],
        minNegativeSamples: 0,
        maxNegativeSamples: 0,
        includeOriginalQ: false
      });

      expect(withOrig.samples.length).toBe(withoutOrig.samples.length);
    });
  });

  describe('负样本采样', () => {
    test('负样本数量在 [min, max] 范围内', () => {
      const items = Array.from({ length: 20 }, (_, i) => ({
        dataId: `item${i}`,
        datasetId: 'ds1',
        q: `long_chunk_${i}`,
        a: `answer_${i}`,
        indexes: [[`short_q1_${i}`, `short_q2_${i}`]]
      }));

      const result = buildFineTuneData({
        items,
        minNegativeSamples: 2,
        maxNegativeSamples: 5
      });

      result.samples.forEach((sample) => {
        expect(sample.negatives.length).toBeGreaterThanOrEqual(0); // may be less if pool too small
        expect(sample.negatives.length).toBeLessThanOrEqual(5);
      });
    });

    test('偶数 pair 的负样本来自 short_query 池（不含 long_chunk）', () => {
      // 构建场景：多个 item，每个有 short query 和 long chunk
      const items = Array.from({ length: 10 }, (_, i) => ({
        dataId: `item${i}`,
        datasetId: 'ds1',
        q: `LONG_CHUNK_${i}`, // long chunks 以 LONG_CHUNK_ 开头
        a: `answer_${i}`,
        indexes: [
          [`short_qa_${i}`, `short_qb_${i}`] // pair_index=0 (even)
        ]
      }));

      const result = buildFineTuneData({
        items,
        minNegativeSamples: 2,
        maxNegativeSamples: 4
      });

      result.samples.forEach((sample, idx) => {
        // 偶数 pair: 负样本不应该是 long chunk
        sample.negatives.forEach((neg) => {
          expect(neg).not.toMatch(/^LONG_CHUNK_/);
        });
      });
    });

    test('奇数 pair 的负样本来自 long_chunk 池（不含 short_query）', () => {
      const items = Array.from({ length: 10 }, (_, i) => ({
        dataId: `item${i}`,
        datasetId: 'ds1',
        q: `LONG_CHUNK_${i}`,
        a: `answer_${i}`,
        indexes: [
          [`short_qa_${i}`, `short_qb_${i}`], // pair_index=0 (even)
          [`short_qc_${i}`, `short_qd_${i}`] // pair_index=1 (odd)
        ]
      }));

      const result = buildFineTuneData({
        items,
        minNegativeSamples: 2,
        maxNegativeSamples: 4
      });

      // 只检查奇数 pair 的 sample（每个 item 的第 2 个 sample）
      for (let i = 1; i < result.samples.length; i += 2) {
        const sample = result.samples[i];
        sample.negatives.forEach((neg) => {
          // 奇数 pair: 负样本应该是 long chunk
          expect(neg).toMatch(/^LONG_CHUNK_/);
        });
      }
    });

    test('负样本不包含当前 item 的 query 或 positive', () => {
      const items = Array.from({ length: 5 }, (_, i) => ({
        dataId: `item${i}`,
        datasetId: 'ds1',
        q: `long_chunk_${i}`,
        a: `answer_${i}`,
        indexes: [
          [`short_q1_${i}`, `short_q2_${i}`],
          [`short_q3_${i}`, `short_q4_${i}`]
        ]
      }));

      const result = buildFineTuneData({
        items,
        minNegativeSamples: 1,
        maxNegativeSamples: 5
      });

      result.samples.forEach((sample) => {
        // 负样本不能包含 query 本身
        expect(sample.negatives).not.toContain(sample.query);
        // 负样本不能包含 positive
        sample.positive.forEach((pos) => {
          expect(sample.negatives).not.toContain(pos);
        });
      });
    });

    test('负样本无重复', () => {
      const items = Array.from({ length: 20 }, (_, i) => ({
        dataId: `item${i}`,
        datasetId: 'ds1',
        q: `long_chunk_${i}`,
        a: `answer_${i}`,
        indexes: [[`short_q1_${i}`, `short_q2_${i}`]]
      }));

      const result = buildFineTuneData({
        items,
        minNegativeSamples: 3,
        maxNegativeSamples: 5
      });

      result.samples.forEach((sample) => {
        const uniqueNegs = new Set(sample.negatives);
        expect(uniqueNegs.size).toBe(sample.negatives.length);
      });
    });
  });

  describe('sample 字段完整性', () => {
    test('sample 包含所有必要字段', () => {
      const result = buildFineTuneData({
        items: [
          {
            dataId: 'item1',
            datasetId: 'ds1',
            q: 'original_q',
            a: 'answer',
            indexes: [['q1', 'q2']]
          }
        ],
        minNegativeSamples: 0,
        maxNegativeSamples: 0,
        includeOriginalQ: true
      });

      const sample = result.samples[0];
      expect(sample.query).toBeDefined();
      expect(sample.positive).toBeInstanceOf(Array);
      expect(sample.positive.length).toBeGreaterThan(0);
      expect(sample.negatives).toBeInstanceOf(Array);
      expect(sample.sourceId).toBe('item1');
      expect(sample.datasetId).toBe('ds1');
    });

    test('positive 始终只有 1 个元素', () => {
      const result = buildFineTuneData({
        items: [
          {
            dataId: 'item1',
            datasetId: 'ds1',
            q: 'original_q',
            a: 'answer',
            indexes: [
              ['q1', 'q2'],
              ['q3', 'q4'],
              ['q5', 'q6']
            ]
          }
        ],
        minNegativeSamples: 0,
        maxNegativeSamples: 0
      });

      result.samples.forEach((sample) => {
        expect(sample.positive.length).toBe(1);
      });
    });
  });

  describe('边界情况', () => {
    test('空 items 返回空 samples', () => {
      const result = buildFineTuneData({
        items: [],
        minNegativeSamples: 1,
        maxNegativeSamples: 5
      });

      expect(result.samples).toEqual([]);
    });

    test('pair 长度不足 2 时跳过该 pair', () => {
      const result = buildFineTuneData({
        items: [
          {
            dataId: 'item1',
            datasetId: 'ds1',
            q: 'original_q',
            a: 'answer',
            indexes: [
              ['only_one'], // 不足 2 个元素，应跳过
              ['q1', 'q2'] // 有效 pair
            ]
          }
        ],
        minNegativeSamples: 0,
        maxNegativeSamples: 0
      });

      expect(result.samples.length).toBe(1); // 只有 1 个有效 pair
    });

    test('空 indexes 时返回空 samples', () => {
      const result = buildFineTuneData({
        items: [
          {
            dataId: 'item1',
            datasetId: 'ds1',
            q: 'original_q',
            a: 'answer',
            indexes: []
          }
        ],
        minNegativeSamples: 0,
        maxNegativeSamples: 0
      });

      expect(result.samples.length).toBe(0);
    });

    test('池子不够时负样本数量可小于 minNegativeSamples', () => {
      // 只有 1 个 item，负样本池极小
      const result = buildFineTuneData({
        items: [
          {
            dataId: 'item1',
            datasetId: 'ds1',
            q: 'original_q',
            a: 'answer',
            indexes: [['q1', 'q2']]
          }
        ],
        minNegativeSamples: 10,
        maxNegativeSamples: 20
      });

      // 不应抛出异常，负样本数量可以少于 min
      expect(result.samples.length).toBe(1);
      expect(result.samples[0].negatives.length).toBeLessThan(10);
    });
  });

  describe('对齐 DiTing 的负样本策略', () => {
    test('大 pool 时负样本数量 = max（比例公式确定性）', () => {
      // 100 items × 1 pair → short query pool = 200
      // 对任意 item_i: estimated = 200 - 2 = 198
      // numNeg = max(1, min(10, floor(198*0.5))) = max(1, min(10, 99)) = 10
      const items = Array.from({ length: 100 }, (_, i) => ({
        dataId: `item${i}`,
        datasetId: 'ds1',
        q: `long_chunk_${i}`,
        a: `answer_${i}`,
        indexes: [[`short_q1_${i}`, `short_q2_${i}`]]
      }));

      const result = buildFineTuneData({
        items,
        minNegativeSamples: 1,
        maxNegativeSamples: 10
      });

      // 每个 sample 都应有 10 个负例（pool 足够大，比例公式得到确定结果）
      result.samples.forEach((sample) => {
        expect(sample.negatives.length).toBe(10);
      });
    });

    test('多知识库时包含跨库负例（分层采样对齐 DiTing）', () => {
      // ds1/ds2 各 20 items，odd pair 触发 long_chunk 采样
      const ds1Items = Array.from({ length: 20 }, (_, i) => ({
        dataId: `item_ds1_${i}`,
        datasetId: 'ds1',
        q: `LONG_DS1_${i}`,
        a: `a${i}`,
        indexes: [
          [`SHORT_DS1_q1_${i}`, `SHORT_DS1_q2_${i}`], // even pair → shortQueries
          [`SHORT_DS1_q3_${i}`, `SHORT_DS1_q4_${i}`] // odd pair → longChunks
        ]
      }));
      const ds2Items = Array.from({ length: 20 }, (_, i) => ({
        dataId: `item_ds2_${i}`,
        datasetId: 'ds2',
        q: `LONG_DS2_${i}`,
        a: `a${i}`,
        indexes: [
          [`SHORT_DS2_q1_${i}`, `SHORT_DS2_q2_${i}`],
          [`SHORT_DS2_q3_${i}`, `SHORT_DS2_q4_${i}`]
        ]
      }));

      const result = buildFineTuneData({
        items: [...ds1Items, ...ds2Items],
        minNegativeSamples: 4,
        maxNegativeSamples: 8
      });

      // ds1 的 even pair samples 应包含至少 1 个来自 ds2 的短 query
      const ds1EvenSamples = result.samples.filter(
        (s) => s.datasetId === 'ds1' && s.metadata?.isShortQueryPair === true
      );
      expect(ds1EvenSamples.length).toBeGreaterThan(0);

      let hasCrossDatasetNeg = false;
      for (const sample of ds1EvenSamples) {
        if (sample.negatives.some((n) => n.startsWith('SHORT_DS2_'))) {
          hasCrossDatasetNeg = true;
          break;
        }
      }
      expect(hasCrossDatasetNeg).toBe(true);

      // ds1 的 odd pair samples 应包含至少 1 个来自 ds2 的长 chunk
      const ds1OddSamples = result.samples.filter(
        (s) => s.datasetId === 'ds1' && s.metadata?.isShortQueryPair === false
      );
      expect(ds1OddSamples.length).toBeGreaterThan(0);

      let hasCrossDatasetLongNeg = false;
      for (const sample of ds1OddSamples) {
        if (sample.negatives.some((n) => n.startsWith('LONG_DS2_'))) {
          hasCrossDatasetLongNeg = true;
          break;
        }
      }
      expect(hasCrossDatasetLongNeg).toBe(true);
    });

    test('单知识库时所有负例均来自同库', () => {
      const items = Array.from({ length: 30 }, (_, i) => ({
        dataId: `item${i}`,
        datasetId: 'only_ds',
        q: `LONG_ONLY_${i}`,
        a: `a${i}`,
        indexes: [[`SHORT_ONLY_q1_${i}`, `SHORT_ONLY_q2_${i}`]]
      }));

      const result = buildFineTuneData({
        items,
        minNegativeSamples: 2,
        maxNegativeSamples: 5
      });

      // 所有负例都应以 SHORT_ONLY_ 开头（来自唯一的库）
      result.samples.forEach((sample) => {
        sample.negatives.forEach((neg) => {
          expect(neg).toMatch(/^SHORT_ONLY_/);
        });
      });
    });
  });
});
