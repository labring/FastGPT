import { describe, expect, it } from 'vitest';
import handler from '@/pages/api/core/ai/skill/version/list';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/ai/skill/version/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import { getRootUser, getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';

describe('skill version list', () => {
  it('should return the publisher avatar', async () => {
    const root = await getRootUser();
    const publisher = await getUser(`skill-version-publisher-${Date.now()}`, root.teamId);
    const skill = await MongoAgentSkills.create({
      name: 'Version list skill',
      source: AgentSkillSourceEnum.personal,
      teamId: root.teamId,
      tmbId: root.tmbId
    });
    await MongoAgentSkillsVersion.create({
      skillId: skill._id,
      tmbId: publisher.tmbId,
      versionName: 'v1',
      storageKey: `agent-skills/${root.teamId}/${skill._id}/v1.zip`
    });

    const member = await MongoTeamMember.findById(publisher.tmbId).lean();
    const res = await Call(handler, {
      auth: root,
      body: {
        skillId: String(skill._id),
        pageSize: 10,
        offset: 0
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.list[0]?.sourceMember.avatar).toBe(member?.avatar);
  }, 60_000);
});
