import { beforeEach, describe, expect, it, vi } from 'vitest';

const startSqlFullTextIndexBuild = vi.hoisted(() => vi.fn());
vi.mock('@fastgpt/service/common/vectorDB/fullText/controller', () => ({
  startSqlFullTextIndexBuild
}));
import { ObVectorCtrl } from '@fastgpt/service/common/vectorDB/oceanbase';

const { query, insertBoundRows } = vi.hoisted(() => ({ query: vi.fn(), insertBoundRows: vi.fn() }));
vi.unmock('@fastgpt/service/common/vectorDB/oceanbase');
vi.unmock('@fastgpt/service/common/vectorDB/constants');
vi.mock('@fastgpt/service/common/vectorDB/oceanbase/controller', () => ({
  ObClass: class {
    query = query;
    insertBoundRows = insertBoundRows;
  }
}));

describe.each(['oceanbase', 'seekdb'] as const)('ObVectorCtrl (%s)', (type) => {
  beforeEach(() => {
    query.mockReset().mockResolvedValue([{ affectedRows: 0 }]);
    insertBoundRows
      .mockReset()
      .mockResolvedValue({ insertIds: ['9007199254740993', '9007199254740998'] });
  });

  it('creates the vector and native full-text schema and indexes on init', async () => {
    query.mockResolvedValue([[]]);
    await new ObVectorCtrl({ type }).init();
    expect(query).toHaveBeenCalledWith(expect.stringContaining('m=32, ef_construction=256'));
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'fulltext_tokens LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL'
      )
    );
    expect(startSqlFullTextIndexBuild).toHaveBeenCalledWith(type);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('CREATE FULLTEXT'))).toBe(false);
  });

  it('preserves the existing vector index and starts full-text initialization on restart', async () => {
    startSqlFullTextIndexBuild.mockClear();
    query.mockImplementation(async (sql: string) => [
      sql.startsWith('SHOW INDEX') ? [{ Column_name: 'vector', Index_type: 'VECTOR' }] : []
    ]);
    await new ObVectorCtrl({ type }).init();
    expect(query.mock.calls.some(([sql]) => String(sql).includes('CREATE VECTOR INDEX'))).toBe(
      false
    );
    expect(startSqlFullTextIndexBuild).toHaveBeenCalledWith(type);
  });

  it.each([200, 100])('applies the supplied search width %j', async (hnswEfSearch) => {
    query.mockResolvedValue([[{}, []]]);
    await new ObVectorCtrl({ type }).embRecall({
      teamId: 'team',
      datasetIds: ['dataset'],
      vector: [0.1, 0.2],
      limit: 100,
      hnswEfSearch,
      forbidCollectionIdList: []
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('SET ob_hnsw_ef_search = ?;'), [
      hnswEfSearch,
      '[0.1,0.2]',
      'team',
      ['dataset'],
      100
    ]);
  });

  it('widens collection candidates inside the requested scope and retries exactly on underfill', async () => {
    query
      .mockResolvedValueOnce([[{}, []]])
      .mockResolvedValueOnce([[{ id: '1', collection_id: 'allowed', score: -0.75 }]]);
    const result = await new ObVectorCtrl({ type }).embRecall({
      teamId: 'team',
      datasetIds: ['dataset'],
      vector: [0.1, 0.2],
      limit: 100,
      hnswEfSearch: 200,
      filterCollectionIdList: ['allowed', 'blocked'],
      forbidCollectionIdList: ['blocked']
    });
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(
        /WHERE team_id = \? AND dataset_id IN \(\?\).*APPROXIMATE LIMIT \?\s+\) candidates WHERE collection_id IN \(\?\)/s
      ),
      [type === 'seekdb' ? 1000 : 512, '[0.1,0.2]', 'team', ['dataset'], 1600, ['allowed'], 100]
    );
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('ORDER BY score + 0 ASC'), [
      '[0.1,0.2]',
      'team',
      ['dataset'],
      ['allowed'],
      100
    ]);
    expect(result.results).toEqual([{ id: '1', collectionId: 'allowed', score: 0.75 }]);
  });

  it.each([200, 1000])(
    'bounds multi-dataset search with configured width %j',
    async (hnswEfSearch) => {
      const datasetIds = ['one', 'two'];
      query.mockResolvedValue([[{}, []]]);
      await new ObVectorCtrl({ type }).embRecall({
        teamId: 'team',
        datasetIds,
        vector: [0.1, 0.2],
        limit: 100,
        hnswEfSearch,
        forbidCollectionIdList: []
      });
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining('SET ob_hnsw_ef_search = ?;'),
        [
          type === 'seekdb' ? 1000 : Math.max(hnswEfSearch, 512),
          '[0.1,0.2]',
          'team',
          datasetIds,
          100
        ]
      );
    }
  );

  it('updates only the selected team and IDs through bound parameters', async () => {
    await new ObVectorCtrl({ type }).refreshCreateTime({ teamId: "team'", idList: ['1', '2'] });
    expect(query).toHaveBeenCalledWith(
      'UPDATE modeldata SET createtime = CURRENT_TIMESTAMP WHERE team_id = ? AND id IN (?,?)',
      ["team'", '1', '2']
    );
  });

  it('skips empty lists and propagates database errors', async () => {
    const ctrl = new ObVectorCtrl({ type });
    await ctrl.refreshCreateTime({ teamId: 'team', idList: [] });
    expect(query).not.toHaveBeenCalled();
    query.mockRejectedValue(new Error('offline'));
    await expect(ctrl.refreshCreateTime({ teamId: 'team', idList: ['1'] })).rejects.toThrow(
      'offline'
    );
  });

  it('writes vector-aligned analyzed tokens through the bound ID-preserving path', async () => {
    expect(
      await new ObVectorCtrl({ type }).insert({
        teamId: 't',
        datasetId: 'd',
        collectionId: 'c',
        vectors: [
          [1, 0],
          [0, 1]
        ],
        texts: ["O'Reilly 中文", '']
      })
    ).toEqual({ insertIds: ['9007199254740993', '9007199254740998'] });
    expect(insertBoundRows).toHaveBeenCalledWith('modeldata', {
      values: [
        [
          { key: 'vector', value: '[1,0]' },
          { key: 'team_id', value: 't' },
          { key: 'dataset_id', value: 'd' },
          { key: 'collection_id', value: 'c' },
          { key: 'fulltext_tokens', value: "o ' reilly 中文" }
        ],
        [
          { key: 'vector', value: '[0,1]' },
          { key: 'team_id', value: 't' },
          { key: 'dataset_id', value: 'd' },
          { key: 'collection_id', value: 'c' },
          { key: 'fulltext_tokens', value: '' }
        ]
      ]
    });
    await expect(
      new ObVectorCtrl({ type }).insert({
        teamId: 't',
        datasetId: 'd',
        collectionId: 'c',
        vectors: [[1, 0]],
        texts: []
      })
    ).rejects.toThrow('match vector');
  });
});
