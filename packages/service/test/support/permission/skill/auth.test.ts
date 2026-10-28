import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import {
  ManagePermissionVal,
  OwnerPermissionVal,
  OwnerRoleVal,
  ReadPermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';

const { mockFindOne, mockGetTmbInfoByTmbId, mockGetTmbPermission } = vi.hoisted(() => ({
  mockFindOne: vi.fn(),
  mockGetTmbInfoByTmbId: vi.fn(),
  mockGetTmbPermission: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/skill/model/schema', () => ({
  MongoAgentSkills: { findOne: mockFindOne }
}));

vi.mock('@fastgpt/service/support/user/team/controller', () => ({
  getTmbInfoByTmbId: mockGetTmbInfoByTmbId
}));

vi.mock('@fastgpt/service/support/permission/controller', () => ({
  getTmbPermission: mockGetTmbPermission
}));

import { authSkillByTmbId } from '@fastgpt/service/support/permission/skill/auth';

const skillId = '507f1f77bcf86cd799439011';

const systemSkill = {
  _id: 'system-skill',
  source: AgentSkillSourceEnum.system,
  type: AgentSkillTypeEnum.skill,
  name: 'System skill',
  description: '',
  teamId: null,
  tmbId: null,
  inheritPermission: true
};

const mockSkillQuery = (skill: Record<string, unknown> | null) => {
  mockFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(skill) });
};

const setup = () => {
  mockGetTmbInfoByTmbId.mockResolvedValue({
    teamId: 'team-a',
    permission: { isOwner: false }
  });
  mockGetTmbPermission.mockResolvedValue(ReadPermissionVal);
  mockSkillQuery({
    _id: skillId,
    teamId: 'team-a',
    tmbId: 'owner-tmb',
    source: AgentSkillSourceEnum.personal,
    deleteTime: null
  });
};

describe('authSkillByTmbId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup();
  });

  it('uses resource ACL roles for personal skills', async () => {
    await expect(
      authSkillByTmbId({ tmbId: 'member-tmb', skillId, per: ReadPermissionVal })
    ).resolves.toMatchObject({ skill: { permission: { hasReadPer: true, isOwner: false } } });
    await expect(
      authSkillByTmbId({ tmbId: 'member-tmb', skillId, per: WritePermissionVal })
    ).rejects.toBe(SkillErrEnum.unAuthSkill);
  });

  it('falls back to the parent ACL when inheritance is missing', async () => {
    mockSkillQuery({
      _id: skillId,
      teamId: 'team-a',
      tmbId: 'owner-tmb',
      source: AgentSkillSourceEnum.personal,
      parentId: 'parent-id',
      deleteTime: null
    });
    mockGetTmbPermission.mockResolvedValueOnce(ReadPermissionVal).mockResolvedValueOnce(0);

    await expect(
      authSkillByTmbId({ tmbId: 'member-tmb', skillId, per: ReadPermissionVal })
    ).resolves.toMatchObject({ skill: { permission: { hasReadPer: true } } });
  });

  it('does not inherit owner from the parent folder ACL', async () => {
    mockSkillQuery({
      _id: skillId,
      teamId: 'team-a',
      tmbId: 'skill-owner',
      source: AgentSkillSourceEnum.personal,
      parentId: 'parent-id',
      inheritPermission: true,
      deleteTime: null
    });
    mockGetTmbPermission.mockResolvedValueOnce(OwnerRoleVal).mockResolvedValueOnce(0);

    await expect(
      authSkillByTmbId({ tmbId: 'folder-owner', skillId, per: OwnerPermissionVal })
    ).rejects.toBe(SkillErrEnum.unAuthSkill);
    mockGetTmbPermission.mockResolvedValueOnce(OwnerRoleVal).mockResolvedValueOnce(0);
    await expect(
      authSkillByTmbId({ tmbId: 'folder-owner', skillId, per: ManagePermissionVal })
    ).resolves.toMatchObject({ skill: { permission: { isOwner: false } } });
  });

  it('allows team members to read global system skills but rejects writes', async () => {
    mockSkillQuery(systemSkill);

    await expect(
      authSkillByTmbId({
        tmbId: 'member-tmb',
        skillId: String(systemSkill._id),
        per: ReadPermissionVal
      })
    ).resolves.toMatchObject({
      skill: { _id: systemSkill._id, permission: { hasReadPer: true, isOwner: false } }
    });
    await expect(
      authSkillByTmbId({
        tmbId: 'member-tmb',
        skillId: String(systemSkill._id),
        per: OwnerPermissionVal
      })
    ).rejects.toBe(SkillErrEnum.unAuthSkill);
    expect(mockGetTmbPermission).not.toHaveBeenCalled();
  });

  it('allows root access and rejects cross-team access', async () => {
    mockSkillQuery({
      _id: skillId,
      teamId: 'team-b',
      tmbId: 'owner-tmb',
      source: AgentSkillSourceEnum.personal,
      deleteTime: null
    });

    await expect(
      authSkillByTmbId({ tmbId: 'root-tmb', skillId, per: ManagePermissionVal, isRoot: true })
    ).resolves.toMatchObject({ skill: { permission: { isOwner: true } } });
    await expect(
      authSkillByTmbId({ tmbId: 'member-tmb', skillId, per: ReadPermissionVal })
    ).rejects.toBe(SkillErrEnum.unAuthSkill);
    expect(mockGetTmbPermission).not.toHaveBeenCalled();
  });

  it('treats deleted skills as nonexistent', async () => {
    mockSkillQuery(null);

    await expect(
      authSkillByTmbId({ tmbId: 'member-tmb', skillId, per: ReadPermissionVal })
    ).rejects.toBe(SkillErrEnum.unExist);
    expect(mockFindOne).toHaveBeenCalledWith({ _id: skillId, deleteTime: null });
  });

  it('reuses provided tmbInfo without querying getTmbInfoByTmbId', async () => {
    await expect(
      authSkillByTmbId({
        tmbId: 'member-tmb',
        skillId,
        per: ReadPermissionVal,
        tmbInfo: {
          teamId: 'team-a',
          permission: { isOwner: false } as any
        }
      })
    ).resolves.toMatchObject({ skill: { permission: { hasReadPer: true } } });
    expect(mockGetTmbInfoByTmbId).not.toHaveBeenCalled();
  });
});
