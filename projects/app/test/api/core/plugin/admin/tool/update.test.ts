import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemToolSecretMaskedValue } from '@fastgpt/global/core/app/tool/systemTool/constants';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import { decryptSecret } from '@fastgpt/service/common/secret/aes256gcm';

const mocks = vi.hoisted(() => ({
  authSystemAdmin: vi.fn(),
  findOne: vi.fn(),
  updateOne: vi.fn(),
  updateMany: vi.fn(),
  mongoSessionRun: vi.fn(),
  getSystemToolDetail: vi.fn()
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

vi.mock('@fastgpt/service/core/app/tool/systemTool/systemTool.repo', () => ({
  SystemToolRepo: {
    getInstance: () => ({
      getSystemToolDetail: mocks.getSystemToolDetail
    })
  }
}));

import { handler } from '@/pages/api/core/plugin/admin/tool/update';

describe('admin system tool update handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSystemAdmin.mockResolvedValue(undefined);
    mocks.findOne.mockResolvedValue(undefined);
    mocks.updateOne.mockResolvedValue(undefined);
    mocks.updateMany.mockResolvedValue(undefined);
    mocks.getSystemToolDetail.mockResolvedValue({
      secretSchema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', isSecret: true }
        }
      }
    });
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

  it('仅更新父工具状态时同步已有子工具状态', async () => {
    await handler(
      {
        body: {
          id: 'systemTool-weather',
          status: PluginStatusEnum.Offline
        }
      } as any,
      {} as any
    );

    expect(mocks.updateMany).toHaveBeenCalledWith(
      { pluginId: { $regex: '^systemTool-weather/' } },
      { status: PluginStatusEnum.Offline },
      { session: 'session' }
    );
  });

  it('保存系统工具配置时丢弃历史资源级 toolDescription', async () => {
    mocks.findOne.mockResolvedValue({
      pluginId: 'systemTool-weather',
      customConfig: {
        name: 'Weather',
        intro: 'Weather intro',
        toolDescription: 'Legacy resource description',
        version: '1.0.0'
      }
    });

    await handler(
      {
        body: {
          id: 'systemTool-weather',
          tags: ['weather']
        }
      } as any,
      {} as any
    );

    expect(mocks.updateOne.mock.calls[0][1].customConfig).toEqual({
      name: 'Weather',
      intro: 'Weather intro',
      version: '1.0.0',
      tags: ['weather']
    });
  });

  it('为新建的子工具写入与父工具一致的密钥', async () => {
    const secretsVal = { apiKey: 'plain-value' };

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

    const storedSecretsVal = mocks.updateOne.mock.calls[0][1].secretsVal;
    expect(decryptSecret(storedSecretsVal.apiKey.secret)).toBe('plain-value');
    expect(storedSecretsVal.apiKey.value).toBe('');

    expect(mocks.updateMany).toHaveBeenCalledWith(
      { pluginId: { $regex: '^systemTool-weather/' } },
      { secretsVal: storedSecretsVal },
      { session: 'session' }
    );
    expect(mocks.updateOne).toHaveBeenLastCalledWith(
      { pluginId: 'systemTool-weather/forecast' },
      expect.objectContaining({
        pluginId: 'systemTool-weather/forecast',
        secretsVal: storedSecretsVal
      }),
      { upsert: true, session: 'session' }
    );
  });

  it('保留管理员详情返回的 masked 系统密钥', async () => {
    mocks.findOne.mockResolvedValue({
      pluginId: 'systemTool-weather',
      secretsVal: { apiKey: 'legacy-value' },
      customConfig: {}
    });

    await handler(
      {
        body: {
          id: 'systemTool-weather',
          secretsVal: { apiKey: SystemToolSecretMaskedValue }
        }
      } as any,
      {} as any
    );

    const storedSecretsVal = mocks.updateOne.mock.calls[0][1].secretsVal;
    expect(decryptSecret(storedSecretsVal.apiKey.secret)).toBe('legacy-value');
  });
});
