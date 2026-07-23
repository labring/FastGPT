import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { FeishuAppSchema } from '@fastgpt/global/support/outLink/type';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import { loadOutlinkProviderConfig } from '@fastgpt/service/support/permission/publish/authLink';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';

vi.mock('@fastgpt/service/support/outLink/schema', () => ({
  MongoOutLink: { findOne: vi.fn() }
}));

const config = {
  _id: 'outlink-id',
  shareId: 'share-id',
  teamId: 'team-id',
  tmbId: 'tmb-id',
  appId: 'app-id',
  name: 'Feishu',
  usagePoints: 0,
  lastTime: new Date('2026-07-23T00:00:00.000Z'),
  type: PublishChannelEnum.feishu,
  showCite: true,
  showRunningStatus: true,
  showSkillReferences: false,
  showFullText: true,
  canDownloadSource: true,
  showWholeResponse: true,
  app: {
    appId: ' feishu-app-id ',
    appSecret: ' feishu-app-secret '
  }
};

describe('loadOutlinkProviderConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(MongoOutLink.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(config)
    } as any);
  });

  it('loads by shareId and channel and parses the app config', async () => {
    await expect(
      loadOutlinkProviderConfig({
        shareId: 'share-id',
        channel: PublishChannelEnum.feishu,
        appSchema: FeishuAppSchema
      })
    ).resolves.toEqual({
      ...config,
      app: {
        appId: 'feishu-app-id',
        appSecret: 'feishu-app-secret'
      }
    });
    expect(MongoOutLink.findOne).toHaveBeenCalledWith({
      shareId: 'share-id',
      type: PublishChannelEnum.feishu
    });
  });

  it('rejects a config from a different or missing channel', async () => {
    vi.mocked(MongoOutLink.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null)
    } as any);

    await expect(
      loadOutlinkProviderConfig({
        shareId: 'share-id',
        channel: PublishChannelEnum.feishu,
        appSchema: FeishuAppSchema
      })
    ).rejects.toBe(OutLinkErrEnum.linkUnInvalid);
  });

  it('rejects an invalid app config', async () => {
    vi.mocked(MongoOutLink.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ ...config, app: { appId: '' } })
    } as any);

    await expect(
      loadOutlinkProviderConfig({
        shareId: 'share-id',
        channel: PublishChannelEnum.feishu,
        appSchema: FeishuAppSchema
      })
    ).rejects.toBe(OutLinkErrEnum.linkUnInvalid);
  });
});
