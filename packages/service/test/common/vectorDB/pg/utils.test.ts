import { describe, expect, it } from 'vitest';
import { buildPgVectorRecallQuery } from '@fastgpt/service/common/vectorDB/pg/utils';

const props = {
  teamId: 'team',
  datasetIds: ['large', 'small', 'pending', 'large'],
  vector: [0.1, 0.2],
  limit: 100,
  hnswEfSearch: 200,
  forbidCollectionIdList: []
};

describe('buildPgVectorRecallQuery', () => {
  it.each([
    ['ready', 4999, false],
    ['ready', 5000, true],
    ['ready', 10000, true],
    ['none', 50000, false],
    ['pending', 50000, false],
    ['building', 50000, false],
    ['removing', 50000, false],
    ['failed', 50000, false]
  ] as const)('routes %s with %i rows through HNSW=%s', (pgIndex, rows, usesHnsw) => {
    const query = buildPgVectorRecallQuery({
      ...props,
      datasetIds: ['retained'],
      datasetVectorData: [{ datasetId: 'retained', rows, pgIndex }]
    })!;
    expect(query.usesHnsw).toBe(usesHnsw);
    expect(query.maxScanTuples).toBe(usesHnsw ? rows : 0);
    expect(query.text.includes('AS MATERIALIZED')).toBe(usesHnsw);
    expect(query.values).toEqual(usesHnsw ? ['[0.1,0.2]', 100] : ['[0.1,0.2]', 100, 'retained']);
  });

  it('queries ready large datasets individually and all other datasets in one exact group', () => {
    const query = buildPgVectorRecallQuery({
      ...props,
      datasetVectorData: [
        { datasetId: 'large', rows: 10001, pgIndex: 'ready' },
        { datasetId: 'small', rows: 4999, pgIndex: 'ready' },
        { datasetId: 'pending', rows: 50000, pgIndex: 'building' },
        { datasetId: 'unselected', rows: 50000, pgIndex: 'ready' }
      ]
    })!;
    expect(query.usesHnsw).toBe(true);
    expect(query.maxScanTuples).toBe(10001);
    expect(query.text.match(/AS MATERIALIZED/g)).toHaveLength(1);
    expect(query.text).toContain('vector::halfvec(2) <#> $1::vector::halfvec(2)');
    expect(query.text).toContain('vector::vector <#> $1::vector AS score');
    expect(query.text).toContain('UNION ALL');
    expect(query.text).toContain('ORDER BY (vector::vector <#> $1::vector) + 0');
    expect(query.values).toEqual(['[0.1,0.2]', 100, 'small', 'pending']);
    expect(query.text).toContain("WHERE dataset_id = 'large'");
    expect(query.text).toContain(
      "WHERE team_id = 'team' AND dataset_id IN ($3::varchar, $4::varchar)"
    );
    const candidates = query.text.slice(0, query.text.indexOf('SELECT id, collection_id, score'));
    expect(candidates).not.toContain('team_id');
    expect(query.text).not.toContain('unselected');
  });

  it('keeps every indexed group at the upstream limit and sorts once across all groups', () => {
    const query = buildPgVectorRecallQuery({
      ...props,
      datasetIds: ['a', 'b'],
      datasetVectorData: [
        { datasetId: 'a', rows: 40000, pgIndex: 'ready' },
        { datasetId: 'b', rows: 150000, pgIndex: 'ready' }
      ]
    })!;
    expect(query.maxScanTuples).toBe(150000);
    expect(query.text.match(/AS MATERIALIZED/g)).toHaveLength(2);
    expect(query.text).not.toContain('ANY(');
    expect(query.text).not.toContain('team_id');
    expect(query.values).toHaveLength(2);
    expect(query.text).toMatch(/ORDER BY score, id LIMIT \$2$/);
    // 每组候选已有 limit，只需要一次全局 FP32 重排，避免重复的组内排序与截断。
    expect(query.text.match(/ORDER BY score/g)).toHaveLength(1);
    expect(query.text.match(/LIMIT \$2/g)).toHaveLength(3);
  });

  it('caps the scan budget at the PostgreSQL integer parameter limit', () => {
    const query = buildPgVectorRecallQuery({
      ...props,
      datasetIds: ['large'],
      datasetVectorData: [{ datasetId: 'large', rows: 3_000_000_000, pgIndex: 'ready' }]
    })!;
    expect(query.maxScanTuples).toBe(2_147_483_647);
  });

  it('uses one exact query without metadata', () => {
    const query = buildPgVectorRecallQuery(props)!;
    expect(query.usesHnsw).toBe(false);
    expect(query.maxScanTuples).toBe(0);
    expect(query.text).not.toContain('UNION ALL');
    expect(query.text).not.toContain('halfvec');
    expect(query.values.slice(2)).toEqual(['large', 'small', 'pending']);
    expect(query.text).toContain('dataset_id IN ($3::varchar, $4::varchar, $5::varchar)');
  });

  it('applies allow minus deny before candidate selection and binds collection IDs', () => {
    const query = buildPgVectorRecallQuery({
      ...props,
      datasetVectorData: [{ datasetId: 'large', rows: 10001, pgIndex: 'ready' }],
      filterCollectionIdList: ['file', 'hidden'],
      forbidCollectionIdList: ['hidden']
    })!;
    expect(query.values[2]).toEqual(['file']);
    expect(query.text).toContain('collection_id = ANY($3::varchar[])');
    expect(query.text.match(/collection_id = ANY/g)).toHaveLength(2);
    expect(query.text).not.toContain('hidden');
    const denied = buildPgVectorRecallQuery({
      ...props,
      datasetVectorData: [{ datasetId: 'large', rows: 10001, pgIndex: 'ready' }],
      forbidCollectionIdList: ['hidden']
    })!;
    expect(denied.text).toContain('NOT (collection_id = ANY($3::varchar[]))');
    expect(denied.values[2]).toEqual(['hidden']);
    expect(denied.text.match(/NOT \(collection_id = ANY/g)).toHaveLength(2);
  });

  it('escapes tenant/dataset literals and binds vector values', () => {
    const query = buildPgVectorRecallQuery({
      ...props,
      teamId: "t' OR true --",
      datasetIds: ["d' OR true --", "s' OR true --"],
      datasetVectorData: [{ datasetId: "d' OR true --", rows: 40000, pgIndex: 'ready' }]
    })!;
    expect(query.text).toContain("team_id = 't'' OR true --'");
    expect(query.text).toContain("dataset_id = 'd'' OR true --'");
    expect(query.text).toContain('dataset_id IN ($3::varchar)');
    expect(query.values[2]).toBe("s' OR true --");
    expect(query.text).not.toContain('[0.1,0.2]');
  });

  it.each([
    { datasetIds: [] },
    { limit: 0 },
    { filterCollectionIdList: [] },
    { filterCollectionIdList: ['hidden'], forbidCollectionIdList: ['hidden'] }
  ])('short-circuits empty scopes: %j', (overrides) => {
    expect(buildPgVectorRecallQuery({ ...props, ...overrides })).toBeUndefined();
  });

  it.each([{ limit: 0.5 }, { vector: [] }, { vector: [Infinity] }, { limit: NaN }])(
    'rejects invalid dynamic SQL dimensions/limits: %j',
    (overrides) => {
      expect(() => buildPgVectorRecallQuery({ ...props, ...overrides })).toThrow('Invalid PG');
    }
  );
});
