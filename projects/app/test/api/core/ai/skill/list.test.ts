import { describe, expect, it } from 'vitest';
import handler from '@/pages/api/core/ai/skill/list';
import publishHandler from '@/pages/api/core/app/version/publish';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import type { ListSkillsQuery, ListSkillsResponse } from '@fastgpt/global/core/ai/skill/api';
import { onCreateApp } from '@/pages/api/core/app/create';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';

describe('POST /api/core/ai/skill/list', () => {
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

  it('appCount 基于已发布版本的 resourceRefs，草稿保存不影响统计', async () => {
    const user = await getUser(`agent-skill-list-published-refs-${getNanoid(6)}`);

    const [publishedSkill, draftSkill] = await MongoAgentSkills.create([
      {
        name: 'Published Skill',
        type: AgentSkillTypeEnum.skill,
        source: AgentSkillSourceEnum.personal,
        teamId: user.teamId,
        tmbId: user.tmbId
      },
      {
        name: 'Draft Skill',
        type: AgentSkillTypeEnum.skill,
        source: AgentSkillSourceEnum.personal,
        teamId: user.teamId,
        tmbId: user.tmbId
      }
    ]);

    const createSkillNode = (skillId: string): StoreNodeItemType =>
      ({
        nodeId: `node-${skillId}`,
        name: 'Agent',
        flowNodeType: FlowNodeTypeEnum.agent,
        inputs: [
          {
            key: NodeInputKeyEnum.skills,
            label: 'Skills',
            renderTypeList: [FlowNodeInputTypeEnum.selectSkill],
            valueType: WorkflowIOValueTypeEnum.arrayObject,
            value: [{ skillId }]
          }
        ],
        outputs: []
      }) as StoreNodeItemType;

    const appId = await onCreateApp({
      name: 'Skill Ref App',
      type: AppTypeEnum.chatAgent,
      modules: [createSkillNode(String(publishedSkill._id))],
      edges: [],
      chatConfig: {},
      teamId: user.teamId,
      tmbId: user.tmbId
    });

    const draftSaveRes = await Call(publishHandler, {
      auth: user,
      query: { appId },
      body: {
        nodes: [createSkillNode(String(draftSkill._id))],
        edges: [],
        chatConfig: {},
        isPublish: false,
        versionName: 'draft'
      }
    });
    expect(draftSaveRes.code).toBe(200);

    const draftRes = await Call<ListSkillsQuery, Record<string, never>, ListSkillsResponse>(
      handler,
      {
        auth: user,
        body: {
          source: 'mine',
          parentId: null
        }
      }
    );

    expect(draftRes.code).toBe(200);
    const getCount = (skillId: string) =>
      draftRes.data.list.find((item) => String(item._id) === skillId)?.appCount;
    expect(getCount(String(publishedSkill._id))).toBe(1);
    expect(getCount(String(draftSkill._id))).toBe(0);

    const publishRes = await Call(publishHandler, {
      auth: user,
      query: { appId },
      body: {
        nodes: [createSkillNode(String(draftSkill._id))],
        edges: [],
        chatConfig: {},
        isPublish: true,
        versionName: 'publish draft'
      }
    });
    expect(publishRes.code).toBe(200);

    const publishedRes = await Call<ListSkillsQuery, Record<string, never>, ListSkillsResponse>(
      handler,
      {
        auth: user,
        body: {
          source: 'mine',
          parentId: null
        }
      }
    );

    const getPublishedCount = (skillId: string) =>
      publishedRes.data.list.find((item) => String(item._id) === skillId)?.appCount;
    expect(getPublishedCount(String(publishedSkill._id))).toBe(0);
    expect(getPublishedCount(String(draftSkill._id))).toBe(1);
  });
});
