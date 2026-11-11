import { getTestInstanceConfig } from '@test/utils/instanceConfigSnapshot';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Call } from '@test/utils/request';

const mocks = vi.hoisted(() => ({
  pluginClient: {
    exchangeDebugSessionConnectionKey: vi.fn()
  }
}));

vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin', () => ({
  pluginClient: mocks.pluginClient
}));

import handler from '@/pages/api/plugin/debug-channel/connection-key/exchange';

describe('plugin debug channel connection key exchange handler', () => {
  let originalIsPlus: unknown;
  let originalRemoteDebug: boolean;

  beforeEach(() => {
    originalRemoteDebug = getTestInstanceConfig().subservice.plugin.remoteDebug;
    getTestInstanceConfig().subservice.plugin.remoteDebug = true;
    originalIsPlus = global.feConfigs?.isPlus;
    global.feConfigs = {
      ...global.feConfigs,
      isPlus: true
    } as any;
    mocks.pluginClient.exchangeDebugSessionConnectionKey.mockReset();
    mocks.pluginClient.exchangeDebugSessionConnectionKey.mockResolvedValue({
      gatewayUrl: 'wss://gateway.example.com/debug',
      transport: 'websocket',
      source: 'debug:tmbId:tmb_test',
      connectToken: 'connect_token',
      expiresAt: 1_781_500_300_000
    });
  });

  afterEach(() => {
    getTestInstanceConfig().subservice.plugin.remoteDebug = originalRemoteDebug;
    global.feConfigs = {
      ...global.feConfigs,
      isPlus: originalIsPlus
    } as any;
  });

  it('exchanges connectionKey through plugin client without exposing internal token', async () => {
    const res = await Call(handler, {
      body: {
        connectionKey: 'connection_key'
      }
    });

    expect(res.code).toBe(200);
    expect(mocks.pluginClient.exchangeDebugSessionConnectionKey).toHaveBeenCalledWith({
      connectionKey: 'connection_key'
    });
    expect(res.data).toEqual({
      gatewayUrl: 'wss://gateway.example.com/debug',
      transport: 'websocket',
      source: 'debug:tmbId:tmb_test',
      connectToken: 'connect_token',
      expiresAt: 1_781_500_300_000
    });
  });

  it('exchanges connectionKey from an HTTP connect link query', async () => {
    const res = await Call(handler, {
      method: 'GET',
      query: {
        connectionKey: 'connection_key_from_link'
      }
    });

    expect(res.code).toBe(200);
    expect(mocks.pluginClient.exchangeDebugSessionConnectionKey).toHaveBeenCalledWith({
      connectionKey: 'connection_key_from_link'
    });
  });

  it.each(['GET', 'POST'])(
    'rejects %s exchanges while remote debugging is disabled',
    async (method) => {
      getTestInstanceConfig().subservice.plugin.remoteDebug = false;
      const key = { connectionKey: 'synthetic-existing-connection-key' };
      const result = await Call(handler, {
        method,
        ...(method === 'GET' ? { query: key } : { body: key })
      });
      expect(result.error).toHaveProperty('statusCode', 403);
      expect(mocks.pluginClient.exchangeDebugSessionConnectionKey).not.toHaveBeenCalled();
    }
  );
});
