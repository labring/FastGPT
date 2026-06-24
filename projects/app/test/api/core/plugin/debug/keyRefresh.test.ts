import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Call } from '@test/utils/request';

const mocks = vi.hoisted(() => ({
  authCert: vi.fn(),
  pluginClient: {
    refreshDebugSessionKey: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: mocks.authCert
}));

vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin', () => ({
  pluginClient: mocks.pluginClient
}));

import handler from '@/pages/api/plugin/debug-channel/key:refresh';

describe('plugin debug channel key refresh handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authCert.mockResolvedValue({
      tmbId: 'tmb_test'
    });
    mocks.pluginClient.refreshDebugSessionKey.mockResolvedValue({
      tmbId: 'tmb_test',
      source: 'debug:tmbId:tmb_test',
      status: 'enabled',
      enabled: true,
      keyId: 'key_refreshed',
      connectionKey: 'connection_key_refreshed',
      createdAt: 1_781_500_000_000,
      updatedAt: 1_781_500_100_000,
      refreshedAt: 1_781_500_100_000
    });
  });

  it('returns a refreshed connection key from plugin client', async () => {
    const res = await Call(handler, {
      body: {},
      headers: {
        host: 'fastgpt.example.com'
      },
      auth: {
        tmbId: 'tmb_test'
      } as any
    });

    expect(res.code).toBe(200);
    expect(mocks.pluginClient.refreshDebugSessionKey).toHaveBeenCalledWith({
      tmbId: 'tmb_test'
    });
    expect(res.data).toEqual({
      tmbId: 'tmb_test',
      source: 'debug:tmbId:tmb_test',
      status: 'enabled',
      enabled: true,
      keyId: 'key_refreshed',
      connectionKey: 'connection_key_refreshed',
      connectionUrl:
        'https://fastgpt.example.com/api/plugin/debug-channel/connection-key:exchange?connectionKey=connection_key_refreshed',
      createdAt: 1_781_500_000_000,
      updatedAt: 1_781_500_100_000,
      refreshedAt: 1_781_500_100_000
    });
  });
});
