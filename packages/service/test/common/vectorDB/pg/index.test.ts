import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgClient } from '@fastgpt/service/common/vectorDB/pg/controller';
import { PgVectorCtrl } from '@fastgpt/service/common/vectorDB/pg';

vi.unmock('@fastgpt/service/common/vectorDB/pg');
const poolClient = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }));
vi.mock('@fastgpt/service/common/vectorDB/pg/controller', () => ({
  PgClient: { query: vi.fn() },
  connectPg: vi.fn(async () => ({ connect: async () => poolClient }))
}));

describe('PgVectorCtrl.embRecall', () => {
  beforeEach(() => {
    vi.mocked(PgClient.query)
      .mockReset()
      .mockResolvedValue({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });
  });

  it.each([
    {
      name: 'without collection filters',
      forbidCollectionIdList: [],
      filterCollectionIdList: undefined,
      collectionClauses: []
    },
    {
      name: 'with collection allow and deny lists',
      forbidCollectionIdList: ['forbidden'],
      filterCollectionIdList: ['allowed'],
      collectionClauses: ['collection_id = ANY($3::varchar[])']
    }
  ])('scopes the query to the team and datasets $name', async (filters) => {
    await new PgVectorCtrl().embRecall({
      teamId: 'team-a',
      datasetIds: ['dataset-a', 'dataset-b'],
      vector: [0.1, 0.2],
      limit: 20,
      forbidCollectionIdList: filters.forbidCollectionIdList,
      filterCollectionIdList: filters.filterCollectionIdList
    });

    expect(PgClient.query).toHaveBeenCalledOnce();
    const [sql] = vi.mocked(PgClient.query).mock.calls[0];
    expect(sql).toMatch(
      /WHERE\s+team_id = 'team-a'[\s\S]*AND dataset_id = ANY\(\$\d+::varchar\[\]\)/
    );
    for (const clause of filters.collectionClauses) {
      expect(sql).toContain(clause);
    }
  });
});

describe('PgVectorCtrl.embRecall indexed transactions', () => {
  const props = {
    teamId: 'team',
    datasetIds: ['large'],
    vector: [0.1, 0.2],
    limit: 100,
    forbidCollectionIdList: [],
    datasetVectorData: [{ datasetId: 'large', rows: 30001, pgIndex: 'ready' as const }]
  };
  beforeEach(() => {
    poolClient.query.mockReset().mockResolvedValue({ rows: [] });
    poolClient.release.mockReset();
  });

  it('keeps settings and query in one transaction and returns FP32 scores', async () => {
    poolClient.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('grouped_results') ? [{ id: '7', collection_id: 'file', score: -0.9 }] : []
    }));
    expect(await new PgVectorCtrl().embRecall(props)).toEqual({
      results: [{ id: '7', collectionId: 'file', score: 0.9 }]
    });
    expect(poolClient.query.mock.calls.map(([sql]) => sql)[0]).toBe('BEGIN');
    expect(poolClient.query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
    expect(poolClient.query.mock.calls[1][1]).toEqual(['100', '100000']);
    expect(poolClient.release).toHaveBeenCalledExactlyOnceWith(false);
  });

  it.each([false, true])(
    'rolls back failed queries; destroys connection if rollback fails=%s',
    async (rollbackFails) => {
      poolClient.query.mockImplementation(async (sql: string) => {
        if (sql.includes('grouped_results')) throw new Error('query failed');
        if (sql === 'ROLLBACK' && rollbackFails) throw new Error('connection lost');
        return { rows: [] };
      });
      await expect(new PgVectorCtrl().embRecall(props)).rejects.toThrow('query failed');
      expect(poolClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(poolClient.release).toHaveBeenCalledExactlyOnceWith(rollbackFails);
    }
  );

  it('skips queries for empty input or an empty allowed collection set', async () => {
    vi.mocked(PgClient.query).mockClear();
    const ctrl = new PgVectorCtrl();
    await expect(ctrl.embRecall({ ...props, datasetIds: [] })).resolves.toEqual({ results: [] });
    await expect(ctrl.embRecall({ ...props, filterCollectionIdList: [] })).resolves.toEqual({
      results: []
    });
    expect(poolClient.query).not.toHaveBeenCalled();
    expect(PgClient.query).not.toHaveBeenCalled();
  });
});

describe('PgVectorCtrl.refreshCreateTime', () => {
  beforeEach(() => {
    vi.mocked(PgClient.query)
      .mockReset()
      .mockResolvedValue({ rows: [], rowCount: 0, command: 'UPDATE', oid: 0, fields: [] });
  });

  it('updates only the selected team and IDs through bound parameters', async () => {
    await new PgVectorCtrl().refreshCreateTime({ teamId: "team'", idList: ['1', '2'] });
    expect(PgClient.query).toHaveBeenCalledWith(
      'UPDATE modeldata SET createtime = CURRENT_TIMESTAMP WHERE team_id = $1 AND id = ANY($2::bigint[])',
      ["team'", ['1', '2']]
    );
  });

  it('skips empty lists and propagates database errors', async () => {
    const ctrl = new PgVectorCtrl();
    await ctrl.refreshCreateTime({ teamId: 'team', idList: [] });
    expect(PgClient.query).not.toHaveBeenCalled();
    vi.mocked(PgClient.query).mockRejectedValue(new Error('offline'));
    await expect(ctrl.refreshCreateTime({ teamId: 'team', idList: ['1'] })).rejects.toThrow(
      'offline'
    );
  });
});
