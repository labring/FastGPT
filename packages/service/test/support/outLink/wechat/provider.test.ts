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
      name: 'matches a legacy binding fingerprint',
      app: { status: 'online', ...login },
      queuedKey: getWechatLoginFingerprint(login),
      admitted: true
    },
    {
      name: 'matches the login established by v4.17.4',
      app: reboundOnOldVersion,
      queuedKey: getWechatLoginFingerprint(reboundOnOldVersion),
      admitted: true
    },
    {
      name: 'carries a stale binding ID after a login on v4.17.4',
      app: reboundOnOldVersion,
      queuedKey: bindingId,
      admitted: false
    }
  ])('checks provenance when the job $name', async ({ app, queuedKey, admitted }) => {
    mocks.loadConfig.mockResolvedValue({ appId: 'app-1', app });
    const onMessage = vi.fn();
    const provider = createWechatOutlinkProvider({ onMessage });

    await provider({ ...job, bindingKey: queuedKey });

    expect(onMessage).toHaveBeenCalledTimes(admitted ? 1 : 0);
    expect(mocks.normalizeMessage).toHaveBeenCalledTimes(admitted ? 1 : 0);
  });

  it.each([undefined, ''])(
    'retains an unverifiable job (key %s) as an unrecoverable failure',
    async (bindingKey) => {
      const onMessage = vi.fn();
      const provider = createWechatOutlinkProvider({ onMessage });

      await expect(provider({ ...job, bindingKey })).rejects.toMatchObject({
        name: 'UnrecoverableError',
        message: 'Wechat reply has no verified binding'
      });

      expect(mocks.loadConfig).not.toHaveBeenCalled();
      expect(mocks.normalizeMessage).not.toHaveBeenCalled();
      expect(onMessage).not.toHaveBeenCalled();
    }
  );
});
