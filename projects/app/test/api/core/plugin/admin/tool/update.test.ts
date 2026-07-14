import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authSystemAdmin: vi.fn(),
  findOne: vi.fn(),
  updateOne: vi.fn(),
  updateMany: vi.fn(),
  mongoSessionRun: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: any) => handler
}));

vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: mocks.authSystemAdmin
}));

vi.mock('@fastgpt/service/core/plugin/tool/systemToolSchema', () => ({
  MongoSystemTool: {
    findOne: mocks.findOne,
    updateOne: mocks.updateOne,
    updateMany: mocks.updateMany
  }
}));

vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: mocks.mongoSessionRun
}));

import { handler } from '@/pages/api/core/plugin/admin/tool/update';

describe('admin system tool update handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSystemAdmin.mockResolvedValue(undefined);
    mocks.findOne.mockResolvedValue(undefined);
    mocks.updateOne.mockResolvedValue(undefined);
    mocks.updateMany.mockResolvedValue(undefined);
    mocks.mongoSessionRun.mockImplementation((fn: (session: string) => unknown) => fn('session'));
  });

  it('同步父工具密钥到所有已有子工具，即使请求没有携带 children', async () => {
    await handler(
      {
        body: {
          id: 'systemTool-weather',
          secretsVal: null
        }
      } as any,
      {} as any
    );

    expect(mocks.updateMany).toHaveBeenCalledWith(
      { pluginId: { $regex: '^systemTool-weather/' } },
      { secretsVal: null },
      { session: 'session' }
    );
    expect(mocks.updateOne).toHaveBeenCalledTimes(1);
  });

  it('为新建的子工具写入与父工具一致的密钥', async () => {
    const secretsVal = { apiKey: 'encrypted-value' };

    await handler(
      {
        body: {
          id: 'systemTool-weather',
          secretsVal,
          children: [{ id: 'forecast', systemKeyCost: 2 }]
        }
      } as any,
      {} as any
    );

    expect(mocks.updateMany).toHaveBeenCalledWith(
      { pluginId: { $regex: '^systemTool-weather/' } },
      { secretsVal },
      { session: 'session' }
    );
    expect(mocks.updateOne).toHaveBeenLastCalledWith(
      { pluginId: 'systemTool-weather/forecast' },
      expect.objectContaining({
        pluginId: 'systemTool-weather/forecast',
        secretsVal
      }),
      { upsert: true, session: 'session' }
    );
  });
});
