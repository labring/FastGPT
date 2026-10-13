import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authUserPer: vi.fn(),
  deleteMany: vi.fn(),
  findRecords: vi.fn(),
  findApps: vi.fn(),
  jsonRes: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authUserPer: mocks.authUserPer
}));
vi.mock('@fastgpt/service/core/app/record/schema', () => ({
  MongoAppRecord: { deleteMany: mocks.deleteMany, find: mocks.findRecords }
}));
vi.mock('@fastgpt/service/core/app/schema', () => ({ MongoApp: { find: mocks.findApps } }));
vi.mock('@fastgpt/service/common/response', () => ({ jsonRes: mocks.jsonRes }));

import handler from '@/pages/api/core/chat/recentlyUsed';

const callHandler = (method: string, query: Record<string, string> = {}) => {
  const req = { method, query, body: {} } as ApiRequestProps;
  const res = { setHeader: vi.fn() } as unknown as ApiResponseType;
  return { req, res, result: handler(req, res) };
};

describe('recently used apps', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authUserPer.mockResolvedValue({ tmbId: 'current-member' });
    mocks.deleteMany.mockResolvedValue({ deletedCount: 2 });
  });

  it('clears only the authenticated member even when another member is supplied', async () => {
    const { req, result } = callHandler('DELETE', { tmbId: 'other-member' });
    await expect(result).resolves.toBeUndefined();
    expect(mocks.authUserPer).toHaveBeenCalledWith({ req, authToken: true, authApiKey: true });
    expect(mocks.deleteMany).toHaveBeenCalledExactlyOnceWith({ tmbId: 'current-member' });
    expect(mocks.findRecords).not.toHaveBeenCalled();
    expect(mocks.findApps).not.toHaveBeenCalled();
  });

  it('does not touch records when authentication fails', async () => {
    const error = new Error('Unauthorized');
    mocks.authUserPer.mockRejectedValueOnce(error);
    await expect(callHandler('DELETE').result).rejects.toBe(error);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it('propagates deletion failures so the client can retry', async () => {
    const error = new Error('Database unavailable');
    mocks.deleteMany.mockRejectedValueOnce(error);
    await expect(callHandler('DELETE').result).rejects.toBe(error);
  });

  it.each(['POST', 'PUT', 'HEAD'])(
    'rejects %s without reading or deleting records',
    async (method) => {
      const { res, result } = callHandler(method);
      await result;
      expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET, DELETE');
      expect(mocks.jsonRes).toHaveBeenCalledWith(res, {
        code: 405,
        error: 'Method not allowed'
      });
      expect(mocks.authUserPer).not.toHaveBeenCalled();
      expect(mocks.deleteMany).not.toHaveBeenCalled();
      expect(mocks.findRecords).not.toHaveBeenCalled();
    }
  );

  it('keeps GET read-only and returns apps in recent-use order', async () => {
    mocks.findRecords.mockReturnValue({
      lean: async () => [{ appId: 'second' }, { appId: 'first' }]
    });
    mocks.findApps.mockReturnValue({
      lean: async () => [
        { _id: 'first', name: 'First', avatar: '' },
        { _id: 'second', name: 'Second', avatar: 'second.svg' }
      ]
    });
    await expect(callHandler('GET').result).resolves.toEqual([
      { appId: 'second', name: 'Second', avatar: 'second.svg' },
      { appId: 'first', name: 'First', avatar: '' }
    ]);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });
});
