import createHandler from '@/pages/api/core/ai/skill/create';
import folderCreateHandler from '@/pages/api/core/ai/skill/folder/create';
import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import type { CreateSkillBody, CreateSkillResponse } from '@fastgpt/global/core/ai/skill/api';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import type { parseHeaderCertRet } from '@test/mocks/request';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

type EmptyRequestParams = Record<string, never>;

/** 父级 skill folder + 一个 read 协作者：子节点 ACL 可直接对比是否合并了父级快照。 */
const setupParentFolder = async () => {
  const users = await getFakeUsers(2);
  const [owner, collaborator] = users.members;
  const teamId = users.owner.teamId;
  const parent = await MongoAgentSkills.create({
    name: 'skill-permission-parent-folder',
    type: AgentSkillTypeEnum.folder,
    source: AgentSkillSourceEnum.personal,
    teamId,
    tmbId: owner.tmbId
  });
  await MongoResourcePermission.create([
    {
      resourceType: PerResourceTypeEnum.agentSkill,
      teamId,
      resourceId: String(parent._id),
      tmbId: owner.tmbId,
      permission: OwnerRoleVal
    },
    {
      resourceType: PerResourceTypeEnum.agentSkill,
      teamId,
      resourceId: String(parent._id),
      tmbId: collaborator.tmbId,
      permission: ReadRoleVal
    }
  ]);
  return { owner, collaborator, teamId, parent };
};

const skillPermissions = async ({ teamId, skillId }: { teamId: string; skillId: string }) => {
  const rows = await MongoResourcePermission.find(
    { resourceType: PerResourceTypeEnum.agentSkill, teamId, resourceId: skillId },
    'tmbId permission'
  ).lean();
  return rows.map((row) => `${String(row.tmbId)}:${row.permission}`).sort();
};

const createSkillChild = async ({
  owner,
  parentId,
  inheritPermission
}: {
  owner: parseHeaderCertRet;
  parentId: string;
  inheritPermission?: boolean;
}) =>
  Call<CreateSkillBody, EmptyRequestParams, CreateSkillResponse>(createHandler, {
    auth: owner,
    body: {
      parentId,
      name: 'permission-child-skill',
      description: '',
      inheritPermission
    }
  });

describe('create skill inheritPermission', () => {
  it('inherits the parent snapshot when inheritPermission is omitted', async () => {
    const { owner, collaborator, teamId, parent } = await setupParentFolder();

    const res = await createSkillChild({ owner, parentId: String(parent._id) });

    expect(res.code).toBe(200);
    const skill = await MongoAgentSkills.findById(res.data).lean();
    expect(skill?.inheritPermission).toBe(true);
    await expect(skillPermissions({ teamId, skillId: String(skill?._id) })).resolves.toEqual(
      [
        `${String(owner.tmbId)}:${OwnerRoleVal}`,
        `${String(collaborator.tmbId)}:${ReadRoleVal}`
      ].sort()
    );
  });

  it('writes only the owner snapshot for an independent skill', async () => {
    const { owner, teamId, parent } = await setupParentFolder();

    const res = await createSkillChild({
      owner,
      parentId: String(parent._id),
      inheritPermission: false
    });

    expect(res.code).toBe(200);
    const skill = await MongoAgentSkills.findById(res.data).lean();
    expect(skill?.inheritPermission).toBe(false);
    await expect(skillPermissions({ teamId, skillId: String(skill?._id) })).resolves.toEqual([
      `${String(owner.tmbId)}:${OwnerRoleVal}`
    ]);
  });
});

describe('create skill folder inheritPermission', () => {
  it('writes only the owner snapshot for an independent folder', async () => {
    const { owner, teamId, parent } = await setupParentFolder();

    const res = await Call<{ parentId: string; name: string; inheritPermission: boolean }>(
      folderCreateHandler,
      {
        auth: owner,
        body: {
          parentId: String(parent._id),
          name: 'independent-child-folder',
          inheritPermission: false
        }
      }
    );

    expect(res.code).toBe(200);
    const folderId = (res.data as { folderId: string }).folderId;
    const folder = await MongoAgentSkills.findById(folderId).lean();
    expect(folder?.inheritPermission).toBe(false);
    await expect(skillPermissions({ teamId, skillId: folderId })).resolves.toEqual([
      `${String(owner.tmbId)}:${OwnerRoleVal}`
    ]);
  });
});
