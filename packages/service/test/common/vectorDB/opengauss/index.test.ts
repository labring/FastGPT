import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OgClient } from '@fastgpt/service/common/vectorDB/opengauss/controller';
import { OpenGaussVectorCtrl } from '@fastgpt/service/common/vectorDB/opengauss';

vi.mock('@fastgpt/service/common/vectorDB/opengauss/controller', () => ({
  OgClient: { query: vi.fn() }
}));

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
