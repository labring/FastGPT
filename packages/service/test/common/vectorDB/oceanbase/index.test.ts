import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    global.systemEnv = {} as any;
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
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'CREATE FULLTEXT INDEX modeldata_fulltext ON modeldata(fulltext_tokens) WITH PARSER SPACE PARSER_PROPERTIES=(min_token_size=1)'
      )
    );

    query.mockReset().mockImplementation(async (sql: string) => {
      if (sql.includes('CREATE FULLTEXT INDEX')) {
        throw new Error('fulltext parser unsupported');
      }
      return [[]];
    });
    await expect(new ObVectorCtrl({ type }).init()).resolves.toBeUndefined();
  });

  it.each([undefined, 100])('applies search width %j', async (configured) => {
    if (configured !== undefined) global.systemEnv.hnswEfSearch = configured;
    query.mockResolvedValue([[{}, {}, []]]);
    await new ObVectorCtrl({ type }).embRecall({
      teamId: 'team',
      datasetIds: ['dataset'],
      vector: [0.1, 0.2],
      limit: 100,
      forbidCollectionIdList: []
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(`SET ob_hnsw_ef_search = ${configured ?? 200};`)
    );
  });

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
