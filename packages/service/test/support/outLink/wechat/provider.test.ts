import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWechatOutlinkProvider } from '@fastgpt/service/support/outLink/wechat/provider';
import { getWechatBindingKey } from '@fastgpt/service/support/outLink/wechat/utils';

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
const bindingKey = getWechatBindingKey(login);
const reboundLogin = { token: 'rebound-token', loginTime: '2026-11-22T08:00:00.000Z' };
const job = {
  shareId: 'share-1',
  userId: 'user-1',
  contextToken: 'context-1',
  lastMsgId: 'message-1'
};

describe('WeChat reply binding', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    {
      name: 'matches the current login key',
      app: { status: 'online', ...login, bindingId },
      queuedKey: bindingKey,
      admitted: true
    },
    {
      name: 'uses a previous login key after rebind',
      app: { status: 'online', ...reboundLogin, bindingId },
      queuedKey: bindingKey,
      admitted: false
    },
    {
      name: 'predates a rebind without a key',
      app: { status: 'online', ...login, bindingId },
      queuedKey: undefined,
      admitted: false
    },
    {
      name: 'belongs to an un-rebound legacy channel without a key',
      app: { status: 'online', ...login },
      queuedKey: undefined,
      admitted: true
    },
    {
      name: 'matches a legacy channel by login key',
      app: { status: 'online', ...login },
      queuedKey: bindingKey,
      admitted: true
    }
  ])(
    'accepts a reply according to its binding when it $name',
    async ({ app, queuedKey, admitted }) => {
      mocks.loadConfig.mockResolvedValue({ appId: 'app-1', app });
      const onMessage = vi.fn();
      const provider = createWechatOutlinkProvider({ onMessage });

      await provider({ ...job, bindingKey: queuedKey });

      expect(onMessage).toHaveBeenCalledTimes(admitted ? 1 : 0);
      expect(mocks.normalizeMessage).toHaveBeenCalledTimes(admitted ? 1 : 0);
    }
  );
});
