import { getTestInstanceConfig } from '@test/utils/instanceConfigSnapshot';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Call } from '@test/utils/request';

const mocks = vi.hoisted(() => ({
  authCert: vi.fn(),
  pluginClient: {
    createDebugSession: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: mocks.authCert
}));

vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin', () => ({
  pluginClient: mocks.pluginClient
}));

import handler from '@/pages/api/plugin/debug-channel/enable';

describe('plugin debug channel enable handler', () => {
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
    mocks.pluginClient.createDebugSession.mockResolvedValue({
      tmbId: 'tmb_test',
      source: 'debug:tmbId:tmb_test',
      status: 'enabled',
      enabled: true,
      keyId: 'key_test',
      connectionKey: 'connection_key',
      createdAt: 1_781_500_000_000,
      updatedAt: 1_781_500_000_000
    });
  });

  afterEach(() => {
    getTestInstanceConfig().subservice.plugin.remoteDebug = originalRemoteDebug;
    global.feConfigs = {
      ...global.feConfigs,
      isPlus: originalIsPlus
    } as any;
  });

  it('uses current tmbId to enable debug channel and returns connection key', async () => {
    const res = await Call(handler, {
      body: {},
      headers: {
        host: 'fastgpt.example.com',
        'x-forwarded-proto': 'https'
      },
      auth: {
        tmbId: 'tmb_test'
      } as any
    });

    expect(res.code).toBe(200);
    expect(mocks.authCert).toHaveBeenCalledWith({
      req: expect.objectContaining({
        body: {}
      }),
      authToken: true
    });
    expect(mocks.pluginClient.createDebugSession).toHaveBeenCalledWith({
      tmbId: 'tmb_test'
    });
    expect(res.data).toEqual({
      tmbId: 'tmb_test',
      source: 'debug:tmbId:tmb_test',
      status: 'enabled',
      enabled: true,
      keyId: 'key_test',
      connectionKey: 'connection_key',
      connectionUrl:
        'https://fastgpt.example.com/api/plugin/debug-channel/connection-key/exchange?connectionKey=connection_key',
      createdAt: 1_781_500_000_000,
      updatedAt: 1_781_500_000_000
    });
  });

  it('blocks creation immediately after the admin switch is disabled and permits re-enabling', async () => {
    const request = { body: {}, headers: { host: 'fastgpt.example.com' } };
    expect((await Call(handler, request)).code).toBe(200);
    mocks.pluginClient.createDebugSession.mockClear();

    getTestInstanceConfig().subservice.plugin.remoteDebug = false;
    const disabled = await Call(handler, request);
    expect(disabled.error).toHaveProperty('message', 'Plugin remote debugging is disabled');
    expect(disabled.error).toHaveProperty('statusCode', 403);
    expect(mocks.pluginClient.createDebugSession).not.toHaveBeenCalled();

    getTestInstanceConfig().subservice.plugin.remoteDebug = true;
    expect((await Call(handler, request)).code).toBe(200);
    expect(mocks.pluginClient.createDebugSession).toHaveBeenCalledTimes(1);
  });

  it('keeps commercial authorization mandatory when the admin switch is enabled', async () => {
    global.feConfigs.isPlus = false;
    const result = await Call(handler, { body: {} });
    expect(result.error).toBe('commercialFeature');
    expect(mocks.pluginClient.createDebugSession).not.toHaveBeenCalled();
  });
});
