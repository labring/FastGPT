import { describe, expect, it } from 'vitest';
import { rewriteAppWorkflowToDetail } from '@fastgpt/service/core/app/utils';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { SelectedAgentSkillItemType } from '@fastgpt/global/core/app/formEdit/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getUser } from '@test/datas/users';

describe('rewriteAppWorkflowToDetail - agent skills', () => {
  it('在 app detail 改写阶段标记已删除 Skill，并刷新可用 Skill 的快照信息', async () => {
    const user = await getUser(`agent-skill-detail-${getNanoid(6)}`);
    const [activeSkill, deletedSkill] = await MongoAgentSkills.create([
      {
        name: 'Current Skill Name',
        description: 'Current skill description',
        avatar: 'current-avatar',
        type: AgentSkillTypeEnum.skill,
        source: AgentSkillSourceEnum.personal,
        teamId: user.teamId,
        tmbId: user.tmbId
      },
      {
        name: 'Deleted Skill Name',
        description: 'Deleted skill description',
        type: AgentSkillTypeEnum.skill,
        source: AgentSkillSourceEnum.personal,
        teamId: user.teamId,
        tmbId: user.tmbId,
        deleteTime: new Date()
      }
    ]);
    const skillsInput = {
      key: NodeInputKeyEnum.skills,
      value: [
        {
          skillId: String(activeSkill._id),
          name: 'Old Skill Name',
          description: 'Old skill description'
        },
        {
          skillId: String(deletedSkill._id),
          name: 'Deleted Snapshot',
          description: 'Deleted snapshot description'
        }
      ]
    };
    const nodes = [
      {
        nodeId: 'agent',
        flowNodeType: FlowNodeTypeEnum.agent,
        inputs: [
          {
            key: NodeInputKeyEnum.selectedTools,
            value: []
          },
          skillsInput
        ],
        outputs: []
      } as StoreNodeItemType
    ];

    await rewriteAppWorkflowToDetail({
      nodes,
      teamId: user.teamId,
      ownerTmbId: user.tmbId,
      isRoot: false
    });

    const rewrittenSkills = skillsInput.value as SelectedAgentSkillItemType[];

    expect(rewrittenSkills).toEqual([
      {
        skillId: String(activeSkill._id),
        name: 'Current Skill Name',
        description: 'Current skill description',
        avatar: 'current-avatar',
        isDeleted: false
      },
      {
        skillId: String(deletedSkill._id),
        name: 'Deleted Snapshot',
        description: 'Deleted snapshot description',
        isDeleted: true
      }
    ]);
  });
});
