import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { OwnerPermissionVal, ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

const { mockFindOne, mockGetTmbInfoByTmbId, mockGetTmbPermission } = vi.hoisted(() => ({
  mockFindOne: vi.fn(),
  mockGetTmbInfoByTmbId: vi.fn(),
  mockGetTmbPermission: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/skill/model/schema', () => ({
  MongoAgentSkills: {
    findOne: mockFindOne
  }
}));

vi.mock('@fastgpt/service/support/user/team/controller', () => ({
  getTmbInfoByTmbId: mockGetTmbInfoByTmbId
}));

vi.mock('@fastgpt/service/support/permission/controller', () => ({
  getTmbPermission: mockGetTmbPermission
}));

import { authSkillByTmbId } from '@fastgpt/service/support/permission/skill/auth';

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

const personalSkill = {
  _id: 'personal-skill',
  source: AgentSkillSourceEnum.personal,
  type: AgentSkillTypeEnum.skill,
  name: 'Personal skill',
  description: '',
  teamId: 'team-b',
  tmbId: 'owner-tmb',
  inheritPermission: true
};

const setSkill = (skill: object) => {
  mockFindOne.mockReturnValue({
    lean: vi.fn().mockResolvedValue(skill)
  });
};

describe('authSkillByTmbId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTmbInfoByTmbId.mockResolvedValue({
      teamId: 'team-a',
      permission: { isOwner: false }
    });
    mockGetTmbPermission.mockResolvedValue(0);
  });

  it('allows team members to read global system skills but rejects writes', async () => {
    setSkill(systemSkill);

    await expect(
      authSkillByTmbId({
        tmbId: 'member-tmb',
        skillId: String(systemSkill._id),
        per: ReadPermissionVal
      })
    ).resolves.toMatchObject({
      skill: { _id: systemSkill._id, permission: { isOwner: false } }
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

  it('rejects a personal skill from another team before checking resource permissions', async () => {
    setSkill(personalSkill);

    await expect(
      authSkillByTmbId({
        tmbId: 'member-tmb',
        skillId: String(personalSkill._id),
        per: ReadPermissionVal
      })
    ).rejects.toBe(SkillErrEnum.unAuthSkill);
    expect(mockGetTmbPermission).not.toHaveBeenCalled();
  });
});
