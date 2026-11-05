import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OgClient } from '@fastgpt/service/common/vectorDB/opengauss/controller';
import { OpenGaussVectorCtrl } from '@fastgpt/service/common/vectorDB/opengauss';

vi.mock('@fastgpt/service/common/vectorDB/opengauss/controller', () => ({
  connectOg: vi.fn(),
  OgClient: { query: vi.fn() }
}));

describe('OpenGaussVectorCtrl.init', () => {
  it('creates the vector index with the agreed HNSW build parameters', async () => {
    vi.mocked(OgClient.query)
      .mockReset()
      .mockResolvedValue({ rows: [] } as any);
    await new OpenGaussVectorCtrl().init();
    expect(OgClient.query).toHaveBeenCalledWith(
      expect.stringContaining('WITH (m = 32, ef_construction = 256)')
    );
  });
});

describe('OpenGaussVectorCtrl.embRecall', () => {
  beforeEach(() => {
    global.systemEnv = {} as any;
    vi.mocked(OgClient.query)
      .mockReset()
      .mockResolvedValue([{}, { rows: [] }] as any);
  });

  it.each([undefined, 100])('scopes the query and applies search width %j', async (configured) => {
    if (configured !== undefined) global.systemEnv.hnswEfSearch = configured;
    await new OpenGaussVectorCtrl().embRecall({
      teamId: 'team-a',
      datasetIds: ['dataset-a', 'dataset-b'],
      vector: [0.1, 0.2],
      limit: 20,
      forbidCollectionIdList: [],
      filterCollectionIdList: undefined
    });

    expect(OgClient.query).toHaveBeenCalledOnce();
    const [query] = vi.mocked(OgClient.query).mock.calls[0];
    expect(query).toMatchObject({ query_timeout: 120_000 });
    const sql = typeof query === 'string' ? query : query.text;
    expect(sql).toContain(`SET LOCAL hnsw.ef_search = ${configured ?? 200};`);
    expect(sql).toMatch(
      /WHERE\s+team_id = 'team-a'\s+AND dataset_id IN \('dataset-a','dataset-b'\)/
    );
  });
});

describe('OpenGaussVectorCtrl.refreshCreateTime', () => {
  beforeEach(() => {
    vi.mocked(OgClient.query)
      .mockReset()
      .mockResolvedValue({ rows: [], rowCount: 0, command: 'UPDATE', oid: 0, fields: [] });
  });

  it('updates only the selected team and IDs through bound parameters', async () => {
    await new OpenGaussVectorCtrl().refreshCreateTime({ teamId: "team'", idList: ['1', '2'] });
    expect(OgClient.query).toHaveBeenCalledWith(
      'UPDATE modeldata SET createtime = CURRENT_TIMESTAMP WHERE team_id = $1 AND id = ANY($2::bigint[])',
      ["team'", ['1', '2']]
    );
  });

  it('skips empty lists and propagates database errors', async () => {
    const ctrl = new OpenGaussVectorCtrl();
    await ctrl.refreshCreateTime({ teamId: 'team', idList: [] });
    expect(OgClient.query).not.toHaveBeenCalled();
    vi.mocked(OgClient.query).mockRejectedValue(new Error('offline'));
    await expect(ctrl.refreshCreateTime({ teamId: 'team', idList: ['1'] })).rejects.toThrow(
      'offline'
    );
  });
});
