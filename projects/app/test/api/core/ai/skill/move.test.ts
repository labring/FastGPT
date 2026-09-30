import updateHandler from '@/pages/api/core/ai/skill/update';
import moveHandler from '@/pages/api/core/ai/skill/batch/move';
import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  createResourceDefaultCollaborators,
  getResourceOwnedClbs
} from '@fastgpt/service/support/permission/controller';
import { updateResourceCollaborators } from '@fastgpt/service/support/permission/resourcePermissionService';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, it, expect, beforeEach } from 'vitest';

const toPermissionRows = (collaborators: { tmbId?: unknown; permission: number }[]) =>
  collaborators
    .map((collaborator) => ({
      tmbId: String(collaborator.tmbId),
      permission: collaborator.permission
    }))
    .sort((a, b) => a.tmbId.localeCompare(b.tmbId));

const createSkillWithOwnerSnapshot = async ({
  teamId,
  tmbId,
  name,
  type
}: {
  teamId: string;
  tmbId: string;
  name: string;
  type: AgentSkillTypeEnum;
}) => {
  const skill = await MongoAgentSkills.create({
    teamId,
    tmbId,
    name,
    type,
    source: AgentSkillSourceEnum.personal
  });
  await mongoSessionRun((session) =>
    createResourceDefaultCollaborators({
      resource: {
        _id: String(skill._id),
        type: skill.type,
        teamId: String(skill.teamId)
      },
      resourceType: PerResourceTypeEnum.agentSkill,
      tmbId: String(skill.tmbId),
      session
    })
  );
  return skill;
};

const setSkillCollaborators = async ({
  skillId,
  teamId,
  type,
  collaborators
}: {
  skillId: string;
  teamId: string;
  type: string;
  collaborators: { tmbId: string; permission: number }[];
}) => {
  await mongoSessionRun(async (session) => {
    await updateResourceCollaborators({
      resource: { _id: skillId, type, teamId },
      resourceModel: MongoAgentSkills,
      resourceType: PerResourceTypeEnum.agentSkill,
      oldCollaborators: await getResourceOwnedClbs({
        teamId,
        resourceId: skillId,
        resourceType: PerResourceTypeEnum.agentSkill,
        session
      }),
      newCollaborators: collaborators,
      session
    });
  });
};

describe('move skill', () => {
  beforeEach(async () => {
    await MongoAgentSkills.deleteMany({});
  });

  it('keeps an independent skill isolated when moved into a shared folder', async () => {
    const { owner, members } = await getFakeUsers(1);
    const member = members[0];
    const teamId = String(owner.teamId);

    const target = await createSkillWithOwnerSnapshot({
      teamId,
      tmbId: String(owner.tmbId),
      name: 'target-folder',
      type: AgentSkillTypeEnum.folder
    });
    await setSkillCollaborators({
      skillId: String(target._id),
      teamId,
      type: target.type,
      collaborators: [
        { tmbId: String(owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(member.tmbId), permission: ReadRoleVal }
      ]
    });

    const skill = await createSkillWithOwnerSnapshot({
      teamId,
      tmbId: String(owner.tmbId),
      name: 'independent-skill',
      type: AgentSkillTypeEnum.skill
    });
    await MongoAgentSkills.updateOne({ _id: skill._id }, { inheritPermission: false });

    const res = await Call(updateHandler, {
      auth: owner,
      body: { skillId: String(skill._id), parentId: String(target._id) }
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);

    const updated = await MongoAgentSkills.findById(skill._id).lean();
    expect(String(updated?.parentId)).toBe(String(target._id));
    expect(updated?.inheritPermission).toBe(false);

    await expect(
      getResourceOwnedClbs({
        teamId,
        resourceId: String(skill._id),
        resourceType: PerResourceTypeEnum.agentSkill
      }).then(toPermissionRows)
    ).resolves.toEqual(
      toPermissionRows([{ tmbId: String(owner.tmbId), permission: OwnerRoleVal }])
    );
  });

  it('merges the target folder collaborators when an inheriting skill is moved', async () => {
    const { owner, members } = await getFakeUsers(1);
    const member = members[0];
    const teamId = String(owner.teamId);

    const target = await createSkillWithOwnerSnapshot({
      teamId,
      tmbId: String(owner.tmbId),
      name: 'target-folder',
      type: AgentSkillTypeEnum.folder
    });
    await setSkillCollaborators({
      skillId: String(target._id),
      teamId,
      type: target.type,
      collaborators: [
        { tmbId: String(owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(member.tmbId), permission: ReadRoleVal }
      ]
    });

    const skill = await createSkillWithOwnerSnapshot({
      teamId,
      tmbId: String(owner.tmbId),
      name: 'inheriting-skill',
      type: AgentSkillTypeEnum.skill
    });

    const res = await Call(updateHandler, {
      auth: owner,
      body: { skillId: String(skill._id), parentId: String(target._id) }
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);

    const updated = await MongoAgentSkills.findById(skill._id).lean();
    expect(String(updated?.parentId)).toBe(String(target._id));
    expect(updated?.inheritPermission).toBe(true);

    await expect(
      getResourceOwnedClbs({
        teamId,
        resourceId: String(skill._id),
        resourceType: PerResourceTypeEnum.agentSkill
      }).then(toPermissionRows)
    ).resolves.toEqual(
      toPermissionRows([
        { tmbId: String(owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(member.tmbId), permission: ReadRoleVal }
      ])
    );
  });

  it('keeps an independent skill isolated when moved back to root', async () => {
    const { owner } = await getFakeUsers(1);
    const teamId = String(owner.teamId);

    const folder = await createSkillWithOwnerSnapshot({
      teamId,
      tmbId: String(owner.tmbId),
      name: 'folder',
      type: AgentSkillTypeEnum.folder
    });
    const skill = await createSkillWithOwnerSnapshot({
      teamId,
      tmbId: String(owner.tmbId),
      name: 'independent-skill',
      type: AgentSkillTypeEnum.skill
    });
    await MongoAgentSkills.updateOne(
      { _id: skill._id },
      { parentId: String(folder._id), inheritPermission: false }
    );

    const res = await Call(updateHandler, {
      auth: owner,
      body: { skillId: String(skill._id), parentId: null }
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);

    const updated = await MongoAgentSkills.findById(skill._id).lean();
    expect(updated?.parentId ?? null).toBeNull();
    expect(updated?.inheritPermission).toBe(false);

    await expect(
      getResourceOwnedClbs({
        teamId,
        resourceId: String(skill._id),
        resourceType: PerResourceTypeEnum.agentSkill
      }).then(toPermissionRows)
    ).resolves.toEqual(
      toPermissionRows([{ tmbId: String(owner.tmbId), permission: OwnerRoleVal }])
    );
  });

  it('keeps independent skills isolated during batch move', async () => {
    const { owner, members } = await getFakeUsers(1);
    const member = members[0];
    const teamId = String(owner.teamId);

    const target = await createSkillWithOwnerSnapshot({
      teamId,
      tmbId: String(owner.tmbId),
      name: 'batch-target-folder',
      type: AgentSkillTypeEnum.folder
    });
    await setSkillCollaborators({
      skillId: String(target._id),
      teamId,
      type: target.type,
      collaborators: [
        { tmbId: String(owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(member.tmbId), permission: ReadRoleVal }
      ]
    });

    const independentSkill = await createSkillWithOwnerSnapshot({
      teamId,
      tmbId: String(owner.tmbId),
      name: 'independent-skill',
      type: AgentSkillTypeEnum.skill
    });
    await MongoAgentSkills.updateOne({ _id: independentSkill._id }, { inheritPermission: false });

    const inheritingSkill = await createSkillWithOwnerSnapshot({
      teamId,
      tmbId: String(owner.tmbId),
      name: 'inheriting-skill',
      type: AgentSkillTypeEnum.skill
    });

    const res = await Call(moveHandler, {
      auth: owner,
      body: {
        ids: [String(independentSkill._id), String(inheritingSkill._id)],
        parentId: String(target._id)
      }
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
    expect(res.data.successIds).toEqual(
      expect.arrayContaining([String(independentSkill._id), String(inheritingSkill._id)])
    );

    const updatedIndependent = await MongoAgentSkills.findById(independentSkill._id).lean();
    expect(String(updatedIndependent?.parentId)).toBe(String(target._id));
    expect(updatedIndependent?.inheritPermission).toBe(false);
    await expect(
      getResourceOwnedClbs({
        teamId,
        resourceId: String(independentSkill._id),
        resourceType: PerResourceTypeEnum.agentSkill
      }).then(toPermissionRows)
    ).resolves.toEqual(
      toPermissionRows([{ tmbId: String(owner.tmbId), permission: OwnerRoleVal }])
    );

    const updatedInheriting = await MongoAgentSkills.findById(inheritingSkill._id).lean();
    expect(String(updatedInheriting?.parentId)).toBe(String(target._id));
    expect(updatedInheriting?.inheritPermission).toBe(true);
    await expect(
      getResourceOwnedClbs({
        teamId,
        resourceId: String(inheritingSkill._id),
        resourceType: PerResourceTypeEnum.agentSkill
      }).then(toPermissionRows)
    ).resolves.toEqual(
      toPermissionRows([
        { tmbId: String(owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(member.tmbId), permission: ReadRoleVal }
      ])
    );
  });
});
