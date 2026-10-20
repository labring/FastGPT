import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgClient } from '@fastgpt/service/common/vectorDB/pg/controller';
import { PgVectorCtrl } from '@fastgpt/service/common/vectorDB/pg';

const { withConcurrency } = vi.hoisted(() => ({ withConcurrency: vi.fn() }));
vi.mock('@fastgpt/dal/redis/caches/lease', () => ({
  LeaseCache: class {
    withConcurrency = withConcurrency;
  }
}));

vi.unmock('@fastgpt/service/common/vectorDB/pg');
vi.mock('@fastgpt/service/common/vectorDB/pg/controller', () => ({ PgClient: { query: vi.fn() } }));

describe('PgVectorCtrl.embRecall', () => {
  beforeEach(() => {
    global.feConfigs = { ...global.feConfigs, isPlus: true };
    global.systemEnv = { ...global.systemEnv, pgVectorRecallConcurrency: 8 };
    withConcurrency.mockReset().mockImplementation(({ fn }) => fn());
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
      collectionClauses: ["collection_id IN ('allowed')", "collection_id NOT IN ('forbidden')"]
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
    expect(withConcurrency).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'vector:pg:recall',
        concurrency: 8,
        ttlMs: 180_000
      })
    );
    const [sql] = vi.mocked(PgClient.query).mock.calls[0];
    expect(sql).toMatch(
      /where\s+team_id = 'team-a'\s+AND dataset_id IN \('dataset-a','dataset-b'\)/
    );
    for (const clause of filters.collectionClauses) {
      expect(sql).toContain(clause);
    }
  });

  it('supports explicitly disabling the shared recall limit', async () => {
    global.systemEnv.pgVectorRecallConcurrency = 0;
    await new PgVectorCtrl().embRecall({
      teamId: 'team',
      datasetIds: ['dataset'],
      vector: [0.1],
      limit: 100,
      forbidCollectionIdList: []
    });
    expect(withConcurrency).not.toHaveBeenCalled();
    expect(PgClient.query).toHaveBeenCalledOnce();
  });

  it.each([
    { isPlus: false, concurrency: 8 },
    { isPlus: false, concurrency: undefined },
    { isPlus: true, concurrency: undefined }
  ])(
    'bypasses lease coordination for edition/default configuration %j',
    async ({ isPlus, concurrency }) => {
      global.feConfigs.isPlus = isPlus;
      if (concurrency === undefined)
        Reflect.deleteProperty(global.systemEnv, 'pgVectorRecallConcurrency');
      else global.systemEnv.pgVectorRecallConcurrency = concurrency;

      await new PgVectorCtrl().embRecall({
        teamId: 'team',
        datasetIds: ['dataset'],
        vector: [0.1],
        limit: 100,
        forbidCollectionIdList: []
      });

      expect(withConcurrency).not.toHaveBeenCalled();
      expect(PgClient.query).toHaveBeenCalledOnce();
    }
  );

  it('reads Admin configuration again for subsequent recalls', async () => {
    const ctrl = new PgVectorCtrl();
    const props = {
      teamId: 'team',
      datasetIds: ['dataset'],
      vector: [0.1],
      limit: 100,
      forbidCollectionIdList: []
    };
    global.systemEnv.pgVectorRecallConcurrency = 4;
    await ctrl.embRecall(props);
    global.systemEnv.pgVectorRecallConcurrency = 12;
    await ctrl.embRecall(props);

    expect(withConcurrency).toHaveBeenNthCalledWith(1, expect.objectContaining({ concurrency: 4 }));
    expect(withConcurrency).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ concurrency: 12 })
    );
  });

  it('does not submit SQL when the shared lease cannot be acquired', async () => {
    const error = new Error('lease unavailable');
    withConcurrency.mockRejectedValueOnce(error);

    await expect(
      new PgVectorCtrl().embRecall({
        teamId: 'team',
        datasetIds: ['dataset'],
        vector: [0.1],
        limit: 100,
        forbidCollectionIdList: []
      })
    ).rejects.toBe(error);
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
