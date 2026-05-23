import { beforeEach, describe, expect, it } from 'vitest';
import handler from '@/pages/api/core/ai/skill/version/update';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/ai/skill/version/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import {
  PerResourceTypeEnum,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';

describe('skill/version/update permission', () => {
  let owner: Awaited<ReturnType<typeof getUser>>;
  let writer: Awaited<ReturnType<typeof getUser>>;
  let writableSkillId: string;
  let protectedSkillId: string;
  let protectedVersionId: string;

  beforeEach(async () => {
    owner = await getUser(`skill-version-owner-${getNanoid(6)}`);
    writer = await getUser(`skill-version-writer-${getNanoid(6)}`, owner.teamId);

    const [writableSkill, protectedSkill] = await MongoAgentSkills.create([
      {
        name: 'Writable Skill',
        source: AgentSkillSourceEnum.personal,
        teamId: owner.teamId,
        tmbId: owner.tmbId
      },
      {
        name: 'Protected Skill',
        source: AgentSkillSourceEnum.personal,
        teamId: owner.teamId,
        tmbId: owner.tmbId
      }
    ]);
    writableSkillId = String(writableSkill._id);
    protectedSkillId = String(protectedSkill._id);

    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.agentSkill,
      teamId: owner.teamId,
      resourceId: writableSkillId,
      tmbId: writer.tmbId,
      permission: WritePermissionVal
    });

    const protectedVersion = await MongoAgentSkillsVersion.create({
      skillId: protectedSkillId,
      tmbId: owner.tmbId,
      versionName: 'protected version',
      storageKey: `agent-skills/${owner.teamId}/${protectedSkillId}/v0.zip`
    });
    protectedVersionId = String(protectedVersion._id);
  });

  it('不能用有写权限的 skillId 更新另一个 skill 的版本名', async () => {
    const res = await Call(handler, {
      auth: writer,
      body: {
        skillId: writableSkillId,
        versionId: protectedVersionId,
        versionName: 'tampered version'
      }
    });

    expect(res.code).not.toBe(200);

    const version = await MongoAgentSkillsVersion.findById(protectedVersionId).lean();
    expect(version?.versionName).toBe('protected version');
  });
});
