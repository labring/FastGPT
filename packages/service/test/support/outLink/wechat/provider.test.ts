import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { loadOutlinkProviderConfig } from '@fastgpt/service/support/permission/publish/authLink';
import { createWechatOutlinkProvider } from '@fastgpt/service/support/outLink/wechat/provider';
import { createWechatOutlinkAdapter } from '@fastgpt/service/support/outLink/wechat/adapter';

const { mockNormalizeMessage, mockRespond } = vi.hoisted(() => ({
  mockNormalizeMessage: vi.fn(),
  mockRespond: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/publish/authLink', () => ({
  loadOutlinkProviderConfig: vi.fn()
}));
vi.mock('@fastgpt/service/support/outLink/runtime/service', () => ({
  runOutlinkRuntime: vi.fn()
}));
vi.mock('@fastgpt/service/support/outLink/wechat/adapter', () => ({
  createWechatOutlinkAdapter: vi.fn(() => ({
    normalizeMessage: mockNormalizeMessage,
    respond: mockRespond
  }))
}));

const outLinkConfig = {
  _id: 'outlink-id',
  shareId: 'share-id',
  teamId: 'team-id',
  tmbId: 'tmb-id',
  appId: 'app-id',
  name: 'Wechat',
  usagePoints: 0,
  lastTime: new Date('2026-07-31T00:00:00.000Z'),
  type: PublishChannelEnum.wechat,
  showCite: true,
  showRunningStatus: true,
  showSkillReferences: false,
  showFullText: true,
  canDownloadSource: true,
  showWholeResponse: true,
  app: {
    token: 'bot-token',
    baseUrl: 'https://ilinkai.weixin.qq.com',
    accountId: 'account-id',
    syncBuf: '',
    status: 'online'
  }
};
const jobData = {
  shareId: 'share-id',
  userId: 'user-id',
  text: 'message',
  contextToken: 'context-token',
  lastMsgId: 'message-id'
};
const message = {
  chatId: 'wechat_share-id_user-id',
  messageId: 'message-id',
  chatUserId: 'user-id',
  query: [{ text: { content: 'message' } }]
};

describe('createWechatOutlinkProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadOutlinkProviderConfig).mockResolvedValue(outLinkConfig as any);
    mockNormalizeMessage.mockResolvedValue(message);
  });

  it('passes the normalized queue message to the shared runtime', async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    const provider = createWechatOutlinkProvider({ onMessage });

    await provider(jobData);

    expect(loadOutlinkProviderConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        shareId: 'share-id',
        channel: PublishChannelEnum.wechat
      })
    );
    expect(createWechatOutlinkAdapter).toHaveBeenCalledWith(expect.objectContaining({ jobData }));
    expect(onMessage).toHaveBeenCalledWith({
      outLinkConfig,
      message,
      respond: mockRespond
    });
  });
});
