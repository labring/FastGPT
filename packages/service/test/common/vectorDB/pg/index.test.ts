import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Client, type Pool } from 'pg';
import { PgClient } from '@fastgpt/service/common/vectorDB/pg/controller';
import { PgVectorCtrl } from '@fastgpt/service/common/vectorDB/pg';

vi.unmock('@fastgpt/service/common/vectorDB/pg');
vi.mock('@fastgpt/service/common/vectorDB/pg/controller', () => ({ PgClient: { query: vi.fn() } }));

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
    const [query] = vi.mocked(PgClient.query).mock.calls[0];
    expect(query).toMatchObject({ query_timeout: 120_000 });
    const sql = typeof query === 'string' ? query : query.text;
    expect(sql).toMatch(
      /where\s+team_id = 'team-a'\s+AND dataset_id IN \('dataset-a','dataset-b'\)/
    );
    for (const clause of filters.collectionClauses) {
      expect(sql).toContain(clause);
    }
  });

  it('waits for the server timeout beyond the default client timeout', async () => {
    const { PgClient: actualPgClient } = await vi.importActual<
      typeof import('@fastgpt/service/common/vectorDB/pg/controller')
    >('@fastgpt/service/common/vectorDB/pg/controller');
    const previousPool = global.pgClient;
    vi.useFakeTimers();
    try {
      const client = Object.assign(new Client({ query_timeout: 60_000 }), { readyForQuery: true });
      const connection = Reflect.get(client, 'connection');
      connection.query = () => {
        setTimeout(() => {
          Reflect.get(client, 'activeQuery').handleError(
            new Error('server statement timeout'),
            connection
          );
        }, 90_000);
      };
      global.pgClient = { query: client.query.bind(client) } as unknown as Pool;
      vi.mocked(PgClient.query).mockImplementation(actualPgClient.query.bind(actualPgClient));
      let settled = false;
      const recall = new PgVectorCtrl()
        .embRecall({
          teamId: 'team',
          datasetIds: ['dataset'],
          vector: [0.1],
          limit: 10,
          forbidCollectionIdList: []
        })
        .finally(() => {
          settled = true;
        });
      const result = expect(recall).rejects.toThrow('server statement timeout');

      await vi.advanceTimersByTimeAsync(60_000);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(30_000);
      await result;
      expect(settled).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      global.pgClient = previousPool;
      vi.useRealTimers();
    }
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
