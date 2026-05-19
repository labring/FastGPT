import { describe, expect, it } from 'vitest';
import handler from '@/pages/api/core/agentSkills/list';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import {
  AgentSkillSourceEnum,
  AgentSkillTypeEnum
} from '@fastgpt/global/core/agentSkills/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import type { ListSkillsQuery, ListSkillsResponse } from '@fastgpt/global/core/agentSkills/api';

describe('POST /api/core/agentSkills/list', () => {
  it('按 skillIds 查询时不受父目录过滤影响，并排除已删除 Skill', async () => {
    const user = await getUser(`agent-skill-list-${getNanoid(6)}`);

    const folder = await MongoAgentSkills.create({
      name: 'Skill Folder',
      type: AgentSkillTypeEnum.folder,
      source: AgentSkillSourceEnum.personal,
      teamId: user.teamId,
      tmbId: user.tmbId
    });
    const [activeSkill, deletedSkill] = await MongoAgentSkills.create([
      {
        name: 'Active Skill',
        type: AgentSkillTypeEnum.skill,
        source: AgentSkillSourceEnum.personal,
        parentId: folder._id,
        teamId: user.teamId,
        tmbId: user.tmbId
      },
      {
        name: 'Deleted Skill',
        type: AgentSkillTypeEnum.skill,
        source: AgentSkillSourceEnum.personal,
        parentId: folder._id,
        teamId: user.teamId,
        tmbId: user.tmbId,
        deleteTime: new Date()
      }
    ]);

    const res = await Call<ListSkillsQuery, Record<string, never>, ListSkillsResponse>(handler, {
      auth: user,
      body: {
        skillIds: [String(activeSkill._id), String(deletedSkill._id)],
        parentId: null,
        withAppCount: false
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.list.map((item) => String(item._id))).toEqual([String(activeSkill._id)]);
  });
});
