import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { FeishuAppSchema } from '@fastgpt/global/support/outLink/type';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import {
  authOutLinkValid,
  loadOutlinkProviderConfig
} from '@fastgpt/service/support/permission/publish/authLink';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { assertCancellation } from '@fastgpt/service/support/user/account/cancellation/guard';
import { getUserIdByTmbId } from '@fastgpt/service/support/user/team/utils';

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: { findOne: vi.fn() }
}));

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

const mockLeanFindOne = (model: { findOne: ReturnType<typeof vi.fn> }, value: unknown) => {
  model.findOne.mockReturnValue({
    lean: vi.fn().mockResolvedValue(value)
  } as any);
};

describe('authOutLinkValid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserIdByTmbId).mockResolvedValue('user-id');
    mockLeanFindOne(vi.mocked(MongoApp), { _id: 'app-id' });
  });

  it('rejects a missing shareId', async () => {
    await expect(authOutLinkValid({})).rejects.toBe(OutLinkErrEnum.linkUnInvalid);
    expect(MongoOutLink.findOne).not.toHaveBeenCalled();
  });

  it('rejects a shareId that does not match a share channel', async () => {
    mockLeanFindOne(vi.mocked(MongoOutLink), null);

    await expect(authOutLinkValid({ shareId: 'share-id' })).rejects.toBe(
      OutLinkErrEnum.linkUnInvalid
    );
    expect(MongoApp.findOne).not.toHaveBeenCalled();
  });

  it('keeps legacy share links anonymously accessible', async () => {
    mockLeanFindOne(vi.mocked(MongoOutLink), { ...config, type: PublishChannelEnum.share });

    const result = await authOutLinkValid({ shareId: 'share-id' });

    expect(MongoOutLink.findOne).toHaveBeenCalledWith({
      shareId: 'share-id',
      type: PublishChannelEnum.share
    });
    expect(MongoApp.findOne).toHaveBeenCalledWith({ _id: 'app-id', deleteTime: null }, '_id');
    expect(result.outLinkConfig.allowAnonymous).toBe(true);
    expect(assertCancellation).toHaveBeenCalled();
  });

  it('preserves an explicit login requirement', async () => {
    mockLeanFindOne(vi.mocked(MongoOutLink), {
      ...config,
      type: PublishChannelEnum.share,
      allowAnonymous: false
    });

    await expect(authOutLinkValid({ shareId: 'share-id' })).resolves.toMatchObject({
      outLinkConfig: { allowAnonymous: false }
    });
  });

  it('rejects a share link whose app is missing or soft deleted', async () => {
    mockLeanFindOne(vi.mocked(MongoOutLink), { ...config, type: PublishChannelEnum.share });
    mockLeanFindOne(vi.mocked(MongoApp), null);

    await expect(authOutLinkValid({ shareId: 'share-id' })).rejects.toBe(
      OutLinkErrEnum.linkUnInvalid
    );
    expect(MongoApp.findOne).toHaveBeenCalledWith({ _id: 'app-id', deleteTime: null }, '_id');
    expect(assertCancellation).not.toHaveBeenCalled();
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
