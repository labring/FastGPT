import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Call } from '@test/utils/request';

const mocks = vi.hoisted(() => ({
  useIPFrequencyLimit: vi.fn(() => async () => undefined),
  pluginClient: {
    exchangeDebugSessionConnectionKey: vi.fn()
  }
}));

vi.mock('@fastgpt/service/common/middle/reqFrequencyLimit', () => ({
  useIPFrequencyLimit: mocks.useIPFrequencyLimit
}));

vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin', () => ({
  pluginClient: mocks.pluginClient
}));

import handler from '@/pages/api/plugin/debug-channel/connection-key:exchange';

describe('plugin debug channel connection key exchange handler', () => {
  let originalIsPlus: unknown;

  beforeEach(() => {
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
    expect(mocks.useIPFrequencyLimit).toHaveBeenCalledWith({
      id: 'plugin-debug-channel-connection-key-exchange',
      seconds: 60,
      limit: 60,
      force: true
    });
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
});
