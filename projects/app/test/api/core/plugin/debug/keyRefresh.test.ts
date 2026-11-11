import { getTestInstanceConfig } from '@test/utils/instanceConfigSnapshot';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

import handler from '@/pages/api/plugin/debug-channel/key/refresh';

describe('plugin debug channel key refresh handler', () => {
  let originalIsPlus: unknown;
  let originalRemoteDebug: boolean;

  beforeEach(() => {
    originalRemoteDebug = getTestInstanceConfig().subservice.plugin.remoteDebug;
    getTestInstanceConfig().subservice.plugin.remoteDebug = true;
    vi.clearAllMocks();
    originalIsPlus = global.feConfigs?.isPlus;
    global.feConfigs = {
      ...global.feConfigs,
      isPlus: true
    } as any;
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

  afterEach(() => {
    getTestInstanceConfig().subservice.plugin.remoteDebug = originalRemoteDebug;
    global.feConfigs = {
      ...global.feConfigs,
      isPlus: originalIsPlus
    } as any;
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
        'https://fastgpt.example.com/api/plugin/debug-channel/connection-key/exchange?connectionKey=connection_key_refreshed',
      createdAt: 1_781_500_000_000,
      updatedAt: 1_781_500_100_000,
      refreshedAt: 1_781_500_100_000
    });
  });

  it('does not refresh credentials after the administrator disables remote debugging', async () => {
    getTestInstanceConfig().subservice.plugin.remoteDebug = false;
    const result = await Call(handler, { body: {} });
    expect(result.error).toHaveProperty('statusCode', 403);
    expect(mocks.pluginClient.refreshDebugSessionKey).not.toHaveBeenCalled();
  });
});
