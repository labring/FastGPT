import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWechatOutlinkProvider } from '@fastgpt/service/support/outLink/wechat/provider';

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
const job = {
  shareId: 'share-1',
  userId: 'user-1',
  contextToken: 'context-1',
  lastMsgId: 'message-1'
};

describe('WeChat reply binding', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    { name: 'matches the binding', storedId: bindingId, queuedKey: bindingId, admitted: true },
    { name: 'uses a previous binding', storedId: bindingId, queuedKey: 'old-key', admitted: false },
    { name: 'predates a rebind', storedId: bindingId, queuedKey: undefined, admitted: false },
    {
      name: 'belongs to a legacy channel',
      storedId: undefined,
      queuedKey: undefined,
      admitted: true
    }
  ])(
    'accepts a reply according to its binding when it $name',
    async ({ storedId, queuedKey, admitted }) => {
      mocks.loadConfig.mockResolvedValue({
        appId: 'app-1',
        app: { status: 'online', token: 'token', bindingId: storedId }
      });
      const onMessage = vi.fn();
      const provider = createWechatOutlinkProvider({ onMessage });

      await provider({ ...job, bindingKey: queuedKey });

      expect(onMessage).toHaveBeenCalledTimes(admitted ? 1 : 0);
      expect(mocks.normalizeMessage).toHaveBeenCalledTimes(admitted ? 1 : 0);
    }
  );
});
