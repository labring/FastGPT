import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { FeishuAppSchema } from '@fastgpt/global/support/outLink/type';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import {
  authOutLinkValid,
  loadOutlinkProviderConfig
} from '@fastgpt/service/support/permission/publish/authLink';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { assertCancellation } from '@fastgpt/service/support/user/account/cancellation/guard';
import { getUserIdByTmbId } from '@fastgpt/service/support/user/team/utils';

vi.mock('@fastgpt/service/support/outLink/schema', () => ({
  MongoOutLink: { findOne: vi.fn() }
}));

vi.mock('@fastgpt/service/support/user/account/cancellation/guard', () => ({
  assertCancellation: vi.fn()
}));

vi.mock('@fastgpt/service/support/user/team/utils', () => ({
  getUserIdByTmbId: vi.fn()
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

describe('authOutLinkValid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserIdByTmbId).mockResolvedValue('user-id');
  });

  it('keeps legacy share links anonymously accessible', async () => {
    vi.mocked(MongoOutLink.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ ...config, type: PublishChannelEnum.share })
    } as any);

    const result = await authOutLinkValid({ shareId: 'share-id' });

    expect(MongoOutLink.findOne).toHaveBeenCalledWith({
      shareId: 'share-id',
      type: PublishChannelEnum.share
    });
    expect(result.outLinkConfig.allowAnonymous).toBe(true);
    expect(assertCancellation).toHaveBeenCalled();
  });

  it('preserves an explicit login requirement', async () => {
    vi.mocked(MongoOutLink.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        ...config,
        type: PublishChannelEnum.share,
        allowAnonymous: false
      })
    } as any);

    await expect(authOutLinkValid({ shareId: 'share-id' })).resolves.toMatchObject({
      outLinkConfig: { allowAnonymous: false }
    });
  });
});

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
