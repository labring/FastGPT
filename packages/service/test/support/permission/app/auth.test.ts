import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import {
  AppReadChatLogPerVal,
  AppReadChatLogRoleVal
} from '@fastgpt/global/support/permission/app/constant';
import {
  ManagePermissionVal,
  ReadPermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { describe, expect, it, vi } from 'vitest';

const { mockFindOne, mockGetTmbInfoByTmbId, mockGetTmbPermission } = vi.hoisted(() => ({
  mockFindOne: vi.fn(),
  mockGetTmbInfoByTmbId: vi.fn(),
  mockGetTmbPermission: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: { findOne: mockFindOne }
}));

vi.mock('@fastgpt/service/support/user/team/controller', () => ({
  getTmbInfoByTmbId: mockGetTmbInfoByTmbId
}));

vi.mock('@fastgpt/service/support/permission/controller', () => ({
  getTmbPermission: mockGetTmbPermission
}));

import { authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';

const appId = '507f1f77bcf86cd799439011';

const mockAppQuery = (app: Record<string, unknown>) => {
  mockFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(app) });
};

const setup = () => {
  vi.clearAllMocks();
  mockGetTmbInfoByTmbId.mockResolvedValue({
    teamId: 'team-a',
    permission: { isOwner: false, hasManagePer: false }
  });
  mockGetTmbPermission.mockResolvedValue(ReadPermissionVal);
  mockAppQuery({
    _id: appId,
    teamId: 'team-a',
    tmbId: 'owner-tmb',
    type: AppTypeEnum.simple,
    favourite: false,
    quick: false
  });
};

describe('authAppByTmbId', () => {
  it('uses resource ACL roles for ordinary apps', async () => {
    setup();

    await expect(
      authAppByTmbId({ tmbId: 'member-tmb', appId, per: ReadPermissionVal })
    ).resolves.toMatchObject({ app: { permission: { hasReadPer: true, isOwner: false } } });
    await expect(
      authAppByTmbId({ tmbId: 'member-tmb', appId, per: WritePermissionVal })
    ).rejects.toBe(AppErrEnum.unAuthApp);
  });

  it('falls back to the parent ACL for an inherited app', async () => {
    setup();
    mockAppQuery({
      _id: appId,
      teamId: 'team-a',
      tmbId: 'owner-tmb',
      type: AppTypeEnum.simple,
      parentId: 'parent-id',
      inheritPermission: true,
      favourite: false,
      quick: false
    });
    mockGetTmbPermission.mockResolvedValueOnce(ReadPermissionVal).mockResolvedValueOnce(0);

    await expect(
      authAppByTmbId({ tmbId: 'member-tmb', appId, per: ReadPermissionVal })
    ).resolves.toMatchObject({ app: { permission: { hasReadPer: true } } });
    expect(mockGetTmbPermission).toHaveBeenNthCalledWith(1, {
      teamId: 'team-a',
      tmbId: 'member-tmb',
      resourceId: 'parent-id',
      resourceType: 'app'
    });
  });

  it('grants read access to favourite apps without an ACL row', async () => {
    setup();
    mockGetTmbPermission.mockResolvedValue(0);
    mockAppQuery({
      _id: appId,
      teamId: 'team-a',
      tmbId: 'owner-tmb',
      type: AppTypeEnum.simple,
      favourite: true,
      quick: false
    });

    await expect(
      authAppByTmbId({ tmbId: 'member-tmb', appId, per: ReadPermissionVal })
    ).resolves.toMatchObject({ app: { permission: { hasReadPer: true } } });
    await expect(
      authAppByTmbId({ tmbId: 'member-tmb', appId, per: WritePermissionVal })
    ).rejects.toBe(AppErrEnum.unAuthApp);
  });

  it('keeps hidden apps read-only and requires manage for chat logs', async () => {
    setup();
    mockAppQuery({
      _id: appId,
      teamId: 'team-a',
      tmbId: 'owner-tmb',
      type: AppTypeEnum.hidden
    });

    await expect(
      authAppByTmbId({ tmbId: 'member-tmb', appId, per: ReadPermissionVal })
    ).resolves.toMatchObject({
      app: { permission: { hasReadPer: true, hasReadChatLogPer: true } }
    });
    await expect(
      authAppByTmbId({ tmbId: 'member-tmb', appId, per: WritePermissionVal })
    ).rejects.toBe(AppErrEnum.unAuthApp);
    await expect(
      authAppByTmbId({ tmbId: 'member-tmb', appId, per: AppReadChatLogPerVal })
    ).rejects.toBe(AppErrEnum.unAuthApp);

    mockGetTmbInfoByTmbId.mockResolvedValue({
      teamId: 'team-a',
      permission: { isOwner: false, hasManagePer: true }
    });
    await expect(
      authAppByTmbId({ tmbId: 'member-tmb', appId, per: AppReadChatLogPerVal })
    ).resolves.toMatchObject({
      app: { permission: { role: ReadPermissionVal | AppReadChatLogRoleVal } }
    });
  });

  it('allows root access and rejects cross-team access', async () => {
    setup();
    mockAppQuery({
      _id: appId,
      teamId: 'team-b',
      tmbId: 'owner-tmb',
      type: AppTypeEnum.simple
    });

    await expect(
      authAppByTmbId({ tmbId: 'root-tmb', appId, per: ManagePermissionVal, isRoot: true })
    ).resolves.toMatchObject({ app: { permission: { isOwner: true } } });
    await expect(
      authAppByTmbId({ tmbId: 'member-tmb', appId, per: ReadPermissionVal })
    ).rejects.toBe(AppErrEnum.unAuthApp);
  });
});
