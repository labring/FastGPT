import { describe, expect, it } from 'vitest';
import { buildPgVectorRecallQuery } from '@fastgpt/service/common/vectorDB/pg/utils';

const props = {
  teamId: 'team',
  datasetIds: ['large', 'small', 'pending', 'large'],
  vector: [0.1, 0.2],
  limit: 100,
  forbidCollectionIdList: []
};

describe('buildPgVectorRecallQuery', () => {
  it('queries ready large datasets individually and all other datasets in one exact group', () => {
    const query = buildPgVectorRecallQuery({
      ...props,
      datasetVectorData: [
        { datasetId: 'large', rows: 30001, pgIndex: 'ready' },
        { datasetId: 'small', rows: 30000, pgIndex: 'ready' },
        { datasetId: 'pending', rows: 50000, pgIndex: 'building' },
        { datasetId: 'unselected', rows: 50000, pgIndex: 'ready' }
      ]
    })!;
    expect(query.usesHnsw).toBe(true);
    expect(query.text.match(/AS MATERIALIZED/g)).toHaveLength(1);
    expect(query.text).toContain('vector::halfvec(2) <#> $1::vector::halfvec(2)');
    expect(query.text).toContain('vector::vector <#> $1::vector AS score');
    expect(query.text).toContain('UNION ALL');
    expect(query.text).toContain('ORDER BY (vector::vector <#> $1::vector) + 0');
    expect(query.values).toEqual(['[0.1,0.2]', 100, ['small', 'pending']]);
    expect(query.text).not.toContain('unselected');
  });

  it('keeps every indexed group at the upstream limit and sorts once across all groups', () => {
    const query = buildPgVectorRecallQuery({
      ...props,
      datasetIds: ['a', 'b'],
      datasetVectorData: ['a', 'b'].map((datasetId) => ({
        datasetId,
        rows: 40000,
        pgIndex: 'ready'
      }))
    })!;
    expect(query.text.match(/AS MATERIALIZED/g)).toHaveLength(2);
    expect(query.text).not.toContain('ANY(');
    expect(query.values).toHaveLength(2);
    expect(query.text).toMatch(/ORDER BY score, id LIMIT \$2$/);
  });

  it('uses one exact query without metadata, including at the threshold', () => {
    const query = buildPgVectorRecallQuery(props)!;
    expect(query.usesHnsw).toBe(false);
    expect(query.text).not.toContain('UNION ALL');
    expect(query.text).not.toContain('halfvec');
    expect(query.values.at(-1)).toEqual(['large', 'small', 'pending']);
  });

  it('applies allow minus deny before candidate selection and binds collection IDs', () => {
    const query = buildPgVectorRecallQuery({
      ...props,
      filterCollectionIdList: ['file', 'hidden'],
      forbidCollectionIdList: ['hidden']
    })!;
    expect(query.values[2]).toEqual(['file']);
    expect(query.text).toContain('collection_id = ANY($3::varchar[])');
    expect(query.text).not.toContain('hidden');
    const denied = buildPgVectorRecallQuery({ ...props, forbidCollectionIdList: ['hidden'] })!;
    expect(denied.text).toContain('NOT (collection_id = ANY($3::varchar[]))');
    expect(denied.values[2]).toEqual(['hidden']);
  });

  it('escapes tenant/dataset literals and binds vector values', () => {
    const query = buildPgVectorRecallQuery({
      ...props,
      teamId: "t' OR true --",
      datasetIds: ["d' OR true --"],
      datasetVectorData: [{ datasetId: "d' OR true --", rows: 40000, pgIndex: 'ready' }]
    })!;
    expect(query.text).toContain("team_id = 't'' OR true --'");
    expect(query.text).toContain("dataset_id = 'd'' OR true --'");
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
