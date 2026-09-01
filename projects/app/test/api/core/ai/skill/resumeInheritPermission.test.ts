import handler from '@/pages/api/core/ai/skill/resumeInheritPermission';
import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('resume agent skill inherit permission api', () => {
  it('restores inheritance for a root skill and persists the flag', async () => {
    const users = await getFakeUsers(1);
    const skill = await MongoAgentSkills.create({
      name: 'resume-skill',
      type: AgentSkillTypeEnum.skill,
      source: AgentSkillSourceEnum.personal,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      inheritPermission: false
    });

    const res = await Call(handler, {
      auth: users.owner,
      query: { skillId: String(skill._id) }
    });

    expect(res.code).toBe(200);
    await expect(MongoAgentSkills.findById(skill._id).lean()).resolves.toMatchObject({
      inheritPermission: true
    });
  });

  it('rejects a caller without skill manage permission', async () => {
    const users = await getFakeUsers(1);
    const skill = await MongoAgentSkills.create({
      name: 'protected-resume-skill',
      type: AgentSkillTypeEnum.skill,
      source: AgentSkillSourceEnum.personal,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      inheritPermission: false
    });

    const res = await Call(handler, {
      auth: users.members[0],
      query: { skillId: String(skill._id) }
    });

    expect(res.code).not.toBe(200);
    await expect(MongoAgentSkills.findById(skill._id).lean()).resolves.toMatchObject({
      inheritPermission: false
    });
  });

  it('restores inheritance for a child skill and materializes the parent ACL', async () => {
    const users = await getFakeUsers(2);
    const parent = await MongoAgentSkills.create({
      name: 'resume-child-skill-parent',
      type: AgentSkillTypeEnum.folder,
      source: AgentSkillSourceEnum.personal,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId
    });
    const child = await MongoAgentSkills.create({
      name: 'resume-child-skill',
      type: AgentSkillTypeEnum.skill,
      source: AgentSkillSourceEnum.personal,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      parentId: parent._id,
      inheritPermission: false
    });
    await MongoResourcePermission.create([
      {
        resourceType: PerResourceTypeEnum.agentSkill,
        teamId: users.owner.teamId,
        resourceId: String(parent._id),
        tmbId: users.owner.tmbId,
        permission: OwnerRoleVal
      },
      {
        resourceType: PerResourceTypeEnum.agentSkill,
        teamId: users.owner.teamId,
        resourceId: String(parent._id),
        tmbId: users.members[0].tmbId,
        permission: ReadRoleVal
      },
      {
        resourceType: PerResourceTypeEnum.agentSkill,
        teamId: users.owner.teamId,
        resourceId: String(child._id),
        tmbId: users.owner.tmbId,
        permission: OwnerRoleVal
      }
    ]);

    const res = await Call(handler, {
      auth: users.owner,
      query: { skillId: String(child._id) }
    });

    expect(res.code).toBe(200);
    await expect(MongoAgentSkills.findById(child._id).lean()).resolves.toMatchObject({
      inheritPermission: true
    });
    await expect(
      MongoResourcePermission.find({
        resourceType: PerResourceTypeEnum.agentSkill,
        teamId: users.owner.teamId,
        resourceId: String(child._id)
      }).lean()
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tmbId: users.owner.tmbId, permission: OwnerRoleVal }),
        expect.objectContaining({ tmbId: users.members[0].tmbId, permission: ReadRoleVal })
      ])
    );
  });
});
