import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { authOutLinkValid } from '@fastgpt/service/support/permission/publish/authLink';
import { authOutLinkInit, authOutLinkLimit } from '@fastgpt/service/support/outLink/runtime/auth';
import { authOutLink, authOutLinkChatStart } from '@/service/support/permission/auth/outLink';
import { authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';
import { parseHeaderCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { notLeaveStatus } from '@fastgpt/global/support/user/team/constant';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import {
  OutLinkCreateBodySchema,
  ShareOutLinkEditSchema
} from '@fastgpt/global/openapi/support/outLink/api';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';

vi.mock('@fastgpt/service/support/permission/publish/authLink', () => ({
  authOutLinkValid: vi.fn()
}));

vi.mock('@fastgpt/service/support/outLink/runtime/auth', () => ({
  authOutLinkInit: vi.fn(),
  authOutLinkLimit: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authAppByTmbId: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  parseHeaderCert: vi.fn()
}));

vi.mock('@fastgpt/service/support/user/team/teamMemberSchema', () => ({
  MongoTeamMember: {
    findOne: vi.fn()
  }
}));

const outLinkConfig = {
  _id: 'out-link-id',
  appId: 'app-id',
  name: 'Public link',
  teamId: 'team-id',
  tmbId: 'member-id',
  showCite: true,
  showRunningStatus: true,
  showSkillReferences: false,
  showFullText: false,
  canDownloadSource: false,
  allowAnonymous: true,
  limit: {
    QPM: 10,
    maxUsagePoints: -1
  }
};

const originalFeConfigs = global.feConfigs;

describe('authOutLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authOutLinkValid).mockResolvedValue({
      outLinkConfig,
      appId: 'app-id'
    } as any);
    vi.mocked(authOutLinkInit).mockResolvedValue({ uid: 'verified-uid' });
    vi.mocked(parseHeaderCert).mockResolvedValue({
      userId: 'user-id',
      tmbId: 'current-team-member-id',
      isRoot: false
    } as any);
    vi.mocked(MongoTeamMember.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'link-team-member-id' })
    } as any);
    vi.mocked(authAppByTmbId).mockResolvedValue({} as any);
  });

  it('keeps anonymous links accessible without a login', async () => {
    const result = await authOutLink({
      shareId: 'share-id',
      outLinkUid: 'raw-uid',
      req: {} as any
    });

    expect(authAppByTmbId).not.toHaveBeenCalled();
    expect(authOutLinkInit).toHaveBeenCalledWith({
      outLinkUid: 'raw-uid',
      tokenUrl: undefined
    });
    expect(result.uid).toBe('verified-uid');
  });

  it('requires app read permission for protected links', async () => {
    vi.mocked(authOutLinkValid).mockResolvedValue({
      outLinkConfig: { ...outLinkConfig, allowAnonymous: false },
      appId: 'app-id'
    } as any);

    await authOutLink({
      shareId: 'share-id',
      outLinkUid: 'raw-uid',
      req: {} as any
    });

    expect(parseHeaderCert).toHaveBeenCalledWith({ req: {}, authToken: true });
    expect(MongoTeamMember.findOne).toHaveBeenCalledWith({
      userId: 'user-id',
      teamId: 'team-id',
      status: notLeaveStatus
    });
    expect(authAppByTmbId).toHaveBeenCalledWith({
      tmbId: 'link-team-member-id',
      appId: 'app-id',
      per: ReadPermissionVal,
      isRoot: false
    });
  });

  it('binds a protected link to the member in the link team, not the submitted UID', async () => {
    vi.mocked(authOutLinkValid).mockResolvedValue({
      outLinkConfig: { ...outLinkConfig, allowAnonymous: false },
      appId: 'app-id'
    } as any);

    const result = await authOutLink({
      shareId: 'share-id',
      outLinkUid: 'victim-member-id',
      req: {} as any
    });

    expect(result.uid).toBe('link-team-member-id');
    expect(authOutLinkInit).toHaveBeenCalledWith({
      outLinkUid: 'victim-member-id',
      tokenUrl: undefined
    });
  });

  it('rejects protected links when the user is not a member of the link team', async () => {
    vi.mocked(authOutLinkValid).mockResolvedValue({
      outLinkConfig: { ...outLinkConfig, allowAnonymous: false },
      appId: 'app-id'
    } as any);
    vi.mocked(MongoTeamMember.findOne).mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue(null)
    } as any);

    await expect(
      authOutLink({
        shareId: 'share-id',
        outLinkUid: 'raw-uid',
        req: {} as any
      })
    ).rejects.toBe(AppErrEnum.unAuthApp);

    expect(authOutLinkInit).not.toHaveBeenCalled();
  });

  it('stops before outlink initialization when app permission is denied', async () => {
    vi.mocked(authOutLinkValid).mockResolvedValue({
      outLinkConfig: { ...outLinkConfig, allowAnonymous: false },
      appId: 'app-id'
    } as any);
    vi.mocked(authAppByTmbId).mockRejectedValueOnce(new Error('unauthorized'));

    await expect(
      authOutLink({
        shareId: 'share-id',
        outLinkUid: 'raw-uid',
        req: {} as any
      })
    ).rejects.toThrow('unauthorized');

    expect(authOutLinkInit).not.toHaveBeenCalled();
  });
});

describe('authOutLinkChatStart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authOutLinkValid).mockResolvedValue({
      outLinkConfig,
      appId: 'app-id'
    } as any);
    vi.mocked(authOutLinkLimit).mockResolvedValue({ uid: 'verified-uid' });
    vi.mocked(parseHeaderCert).mockResolvedValue({
      userId: 'user-id',
      tmbId: 'current-team-member-id',
      isRoot: false
    } as any);
    vi.mocked(MongoTeamMember.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'link-team-member-id' })
    } as any);
    vi.mocked(authAppByTmbId).mockResolvedValue({} as any);
  });

  afterAll(() => {
    global.feConfigs = originalFeConfigs;
  });

  it('商业版在 FastGPT 进程内执行外链校验', async () => {
    global.feConfigs = { ...global.feConfigs, isPlus: true } as any;

    const result = await authOutLinkChatStart({
      shareId: 'share-id',
      outLinkUid: 'raw-uid',
      question: 'hello',
      req: {} as any
    });

    expect(authOutLinkLimit).toHaveBeenCalledWith({
      outLink: outLinkConfig,
      outLinkUid: 'raw-uid',
      question: 'hello'
    });
    expect(result.uid).toBe('verified-uid');
  });

  it('社区版保持历史行为，不执行商业版外链校验', async () => {
    global.feConfigs = { ...global.feConfigs, isPlus: false } as any;

    const result = await authOutLinkChatStart({
      shareId: 'share-id',
      outLinkUid: 'raw-uid',
      question: 'hello',
      req: {} as any
    });

    expect(authOutLinkLimit).not.toHaveBeenCalled();
    expect(authAppByTmbId).not.toHaveBeenCalled();
    expect(result.uid).toBe('raw-uid');
  });
});

describe('share outlink input schemas', () => {
  const input = {
    appId: '68ad85a7463006c963799a05',
    name: 'link'
  };

  it('defaults share links to anonymous access when allowAnonymous is omitted', () => {
    expect(ShareOutLinkEditSchema.parse({ name: 'link' }).allowAnonymous).toBe(true);

    expect(
      OutLinkCreateBodySchema.parse({ ...input, type: PublishChannelEnum.share })
    ).toMatchObject({
      allowAnonymous: true
    });
    expect(
      OutLinkCreateBodySchema.parse({
        ...input,
        type: PublishChannelEnum.share,
        allowAnonymous: false
      })
    ).toMatchObject({
      allowAnonymous: false
    });
  });

  it('does not expose allowAnonymous to non-share channels', () => {
    const result = OutLinkCreateBodySchema.parse({
      ...input,
      type: PublishChannelEnum.feishu,
      allowAnonymous: false
    });

    expect(result).not.toHaveProperty('allowAnonymous');
  });
});
