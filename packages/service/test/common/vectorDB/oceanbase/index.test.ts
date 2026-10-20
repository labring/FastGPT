import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ObVectorCtrl } from '@fastgpt/service/common/vectorDB/oceanbase';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.unmock('@fastgpt/service/common/vectorDB/oceanbase');
vi.mock('@fastgpt/service/common/vectorDB/oceanbase/controller', () => ({
  ObClass: class {
    query = query;
  }
}));

describe.each(['oceanbase', 'seekdb'] as const)('%s refreshCreateTime', (type) => {
  beforeEach(() => {
    query.mockReset().mockResolvedValue([{ affectedRows: 0 }]);
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
