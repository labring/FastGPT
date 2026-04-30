import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockMongoAppFind } = vi.hoisted(() => ({
  mockMongoAppFind: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    find: mockMongoAppFind
  }
}));

import { getMcpToolsets } from '@fastgpt/service/core/app/tool/mcpTool/entity';

const setupFindReturn = (result: any) => {
  const leanFn = vi.fn().mockResolvedValue(result);
  mockMongoAppFind.mockReturnValue({ lean: leanFn });
  return { leanFn };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getMcpToolsets', () => {
  it('should query MongoApp with teamId, ids, and field, and return lean result', async () => {
    const docs = [
      { _id: 'id1', modules: [{ toolConfig: { mcpToolSet: { toolList: [] } } }] },
      { _id: 'id2', modules: [] }
    ];
    const { leanFn } = setupFindReturn(docs);

    const field = { _id: true, modules: true };
    const res = await getMcpToolsets({
      teamId: 'team1',
      ids: ['id1', 'id2'],
      field
    });

    expect(mockMongoAppFind).toHaveBeenCalledTimes(1);
    expect(mockMongoAppFind).toHaveBeenCalledWith(
      { teamId: 'team1', _id: { $in: ['id1', 'id2'] } },
      field
    );
    expect(leanFn).toHaveBeenCalledTimes(1);
    expect(res).toBe(docs);
  });

  it('should pass undefined field when not provided', async () => {
    setupFindReturn([]);

    await getMcpToolsets({ teamId: 'team1', ids: ['id1'] });

    expect(mockMongoAppFind).toHaveBeenCalledWith(
      { teamId: 'team1', _id: { $in: ['id1'] } },
      undefined
    );
  });

  it('should handle empty ids array', async () => {
    const { leanFn } = setupFindReturn([]);

    const res = await getMcpToolsets({ teamId: 'team1', ids: [] });

    expect(mockMongoAppFind).toHaveBeenCalledWith({ teamId: 'team1', _id: { $in: [] } }, undefined);
    expect(leanFn).toHaveBeenCalledTimes(1);
    expect(res).toEqual([]);
  });

  it('should propagate rejection from lean()', async () => {
    const leanFn = vi.fn().mockRejectedValue(new Error('db error'));
    mockMongoAppFind.mockReturnValue({ lean: leanFn });

    await expect(
      getMcpToolsets({ teamId: 'team1', ids: ['id1'], field: { _id: true } })
    ).rejects.toThrow('db error');
  });
});
