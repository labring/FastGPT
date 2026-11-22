import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWechatOutlinkProvider } from '@fastgpt/service/support/outLink/wechat/provider';
import { getWechatLoginFingerprint } from '@fastgpt/service/support/outLink/wechat/utils';

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  normalizeMessage: vi.fn(),
  respond: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/publish/authLink', () => ({
  loadOutlinkProviderConfig: mocks.loadConfig
}));
vi.mock('@fastgpt/service/support/outLink/wechat/adapter', () => ({
  createWechatOutlinkAdapter: () => ({
    normalizeMessage: mocks.normalizeMessage,
    respond: mocks.respond
  })
}));
vi.mock('@fastgpt/service/support/outLink/runtime/service', () => ({
  runOutlinkRuntime: vi.fn()
}));

const bindingId = '44823bae-4a6c-4016-957a-baae1fd135b5';
const login = { token: 'token', loginTime: '2026-11-22T07:00:00.000Z' };
const upgradedBinding = {
  status: 'online',
  ...login,
  bindingId,
  bindingFingerprint: getWechatLoginFingerprint(login)
};
const reboundOnOldVersion = {
  ...upgradedBinding,
  token: 'rebound-token',
  loginTime: '2026-11-22T08:00:00.000Z'
};
const job = {
  shareId: 'share-1',
  userId: 'user-1',
  contextToken: 'context-1',
  lastMsgId: 'message-1'
};

describe('WeChat reply binding', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    { name: 'matches the binding', app: upgradedBinding, queuedKey: bindingId, admitted: true },
    {
      name: 'uses a previous binding',
      app: upgradedBinding,
      queuedKey: 'old-key',
      admitted: false
    },
    {
      name: 'was queued without a key before the current binding',
      app: upgradedBinding,
      queuedKey: undefined,
      queuedAt: Date.parse(login.loginTime) - 1,
      admitted: false
    },
    {
      name: 'has no key even though it was queued after the new binding began',
      app: upgradedBinding,
      queuedKey: undefined,
      queuedAt: Date.parse(login.loginTime) + 1000,
      admitted: false
    },
    {
      name: 'belongs to a legacy channel',
      app: { status: 'online', ...login },
      queuedKey: undefined,
      admitted: true
    },
    {
      name: 'was enqueued by the old release after it rebound the channel',
      app: reboundOnOldVersion,
      queuedKey: undefined,
      admitted: true
    },
    {
      name: 'still carries the key from before rollback',
      app: reboundOnOldVersion,
      queuedKey: bindingId,
      admitted: false
    },
    {
      name: 'has no key and was queued before the old release rebound the channel',
      app: reboundOnOldVersion,
      queuedAt: Date.parse(login.loginTime),
      queuedKey: undefined,
      admitted: false
    }
  ])(
    'accepts a reply according to its binding when it $name',
    async ({ app, queuedKey, queuedAt, admitted }) => {
      mocks.loadConfig.mockResolvedValue({
        appId: 'app-1',
        app
      });
      const onMessage = vi.fn();
      const provider = createWechatOutlinkProvider({ onMessage });

      await provider({ ...job, bindingKey: queuedKey }, queuedAt ?? Date.parse(app.loginTime));

      expect(onMessage).toHaveBeenCalledTimes(admitted ? 1 : 0);
      expect(mocks.normalizeMessage).toHaveBeenCalledTimes(admitted ? 1 : 0);
    }
  );
});
