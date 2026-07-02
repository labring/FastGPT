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

  beforeEach(() => {
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
});
