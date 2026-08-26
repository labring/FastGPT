import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
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

const mockSkillQuery = (skill: Record<string, unknown> | null) => {
  mockFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(skill) });
};

const setup = () => {
  vi.clearAllMocks();
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
  it('uses resource ACL roles for personal skills', async () => {
    setup();

    await expect(
      authSkillByTmbId({ tmbId: 'member-tmb', skillId, per: ReadPermissionVal })
    ).resolves.toMatchObject({ skill: { permission: { hasReadPer: true, isOwner: false } } });
    await expect(
      authSkillByTmbId({ tmbId: 'member-tmb', skillId, per: WritePermissionVal })
    ).rejects.toBe(SkillErrEnum.unAuthSkill);
  });

  it('falls back to the parent ACL when inheritance is missing', async () => {
    setup();
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

  it('allows system skills to be read and rejects write access', async () => {
    setup();
    mockSkillQuery({
      _id: skillId,
      teamId: 'team-a',
      tmbId: 'system-tmb',
      source: AgentSkillSourceEnum.system,
      deleteTime: null
    });

    await expect(
      authSkillByTmbId({ tmbId: 'member-tmb', skillId, per: ReadPermissionVal })
    ).resolves.toMatchObject({ skill: { permission: { hasReadPer: true } } });
    await expect(
      authSkillByTmbId({ tmbId: 'member-tmb', skillId, per: WritePermissionVal })
    ).rejects.toBe(SkillErrEnum.unAuthSkill);
    expect(mockGetTmbPermission).not.toHaveBeenCalled();
  });

  it('allows root access and rejects cross-team access', async () => {
    setup();
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
  });

  it('treats deleted skills as nonexistent', async () => {
    setup();
    mockSkillQuery(null);

    await expect(
      authSkillByTmbId({ tmbId: 'member-tmb', skillId, per: ReadPermissionVal })
    ).rejects.toBe(SkillErrEnum.unExist);
    expect(mockFindOne).toHaveBeenCalledWith({ _id: skillId, deleteTime: null });
  });
});
