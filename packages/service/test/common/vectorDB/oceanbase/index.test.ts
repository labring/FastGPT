import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ObVectorCtrl } from '@fastgpt/service/common/vectorDB/oceanbase';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.unmock('@fastgpt/service/common/vectorDB/oceanbase');
vi.unmock('@fastgpt/service/common/vectorDB/constants');
vi.mock('@fastgpt/service/common/vectorDB/oceanbase/controller', () => ({
  ObClass: class {
    query = query;
  }
}));

describe.each(['oceanbase', 'seekdb'] as const)('ObVectorCtrl (%s)', (type) => {
  beforeEach(() => {
    global.systemEnv = { ...global.systemEnv, hnswEfSearch: 9999 };
    query.mockReset().mockResolvedValue([{ affectedRows: 0 }]);
  });

  it('creates the vector index with the agreed HNSW build parameters', async () => {
    await new ObVectorCtrl({ type }).init();
    expect(query).toHaveBeenCalledWith(expect.stringContaining('m=32, ef_construction=256'));
  });

  it.each([200, 100])('applies the supplied search width %j', async (hnswEfSearch) => {
    query.mockResolvedValue([[{}, {}, []]]);
    await new ObVectorCtrl({ type }).embRecall({
      teamId: 'team',
      datasetIds: ['dataset'],
      vector: [0.1, 0.2],
      limit: 100,
      hnswEfSearch,
      forbidCollectionIdList: []
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(`SET ob_hnsw_ef_search = ${hnswEfSearch};`)
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
});
