import { describe, expect, it } from 'vitest';
import handler from '@/pages/api/core/ai/skill/list';
import publishHandler from '@/pages/api/core/app/version/publish';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import type { ListSkillsQuery, ListSkillsResponse } from '@fastgpt/global/core/ai/skill/api';
import { onCreateApp } from '@/pages/api/core/app/create';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
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

  it('按 skillIds 查询时会在查询阶段过滤当前成员无权读取的 Skill', async () => {
    const owner = await getUser(`agent-skill-list-owner-${getNanoid(6)}`);
    const member = await getUser(`agent-skill-list-member-${getNanoid(6)}`, owner.teamId);

    const [ownedSkill, protectedSkill] = await MongoAgentSkills.create([
      {
        name: 'Owned Skill',
        type: AgentSkillTypeEnum.skill,
        source: AgentSkillSourceEnum.personal,
        teamId: owner.teamId,
        tmbId: member.tmbId
      },
      {
        name: 'Protected Skill',
        type: AgentSkillTypeEnum.skill,
        source: AgentSkillSourceEnum.personal,
        teamId: owner.teamId,
        tmbId: owner.tmbId
      }
    ]);

    const res = await Call<ListSkillsQuery, Record<string, never>, ListSkillsResponse>(handler, {
      auth: member,
      body: {
        source: 'mine',
        skillIds: [String(ownedSkill._id), String(protectedSkill._id)],
        parentId: null,
        withAppCount: false
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.list.map((item) => String(item._id))).toEqual([String(ownedSkill._id)]);
  });

  it('按 skillIds 查询时保留继承父目录读权限的 Skill', async () => {
    const owner = await getUser(`agent-skill-list-inherit-owner-${getNanoid(6)}`);
    const member = await getUser(`agent-skill-list-inherit-member-${getNanoid(6)}`, owner.teamId);

    const folder = await MongoAgentSkills.create({
      name: 'Shared Folder',
      type: AgentSkillTypeEnum.folder,
      source: AgentSkillSourceEnum.personal,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    const inheritedSkill = await MongoAgentSkills.create({
      name: 'Inherited Skill',
      type: AgentSkillTypeEnum.skill,
      source: AgentSkillSourceEnum.personal,
      parentId: folder._id,
      inheritPermission: true,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });

    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.agentSkill,
      teamId: owner.teamId,
      resourceId: folder._id,
      tmbId: member.tmbId,
      permission: ReadPermissionVal
    });

    const res = await Call<ListSkillsQuery, Record<string, never>, ListSkillsResponse>(handler, {
      auth: member,
      body: {
        source: 'mine',
        skillIds: [String(inheritedSkill._id)],
        parentId: null,
        withAppCount: false
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.list.map((item) => String(item._id))).toEqual([String(inheritedSkill._id)]);
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

    const createSkillNode = (skill: { _id: unknown; name: string }): StoreNodeItemType =>
      ({
        nodeId: `node-${String(skill._id)}`,
        name: 'Agent',
        flowNodeType: FlowNodeTypeEnum.agent,
        inputs: [
          {
            key: NodeInputKeyEnum.skills,
            label: 'Skills',
            renderTypeList: [FlowNodeInputTypeEnum.selectSkill],
            valueType: WorkflowIOValueTypeEnum.arrayObject,
            value: [
              {
                skillId: String(skill._id),
                name: skill.name
              }
            ]
          }
        ],
        outputs: []
      }) as StoreNodeItemType;

    const appId = await onCreateApp({
      name: 'Skill Ref App',
      type: AppTypeEnum.chatAgent,
      modules: [createSkillNode(publishedSkill)],
      edges: [],
      chatConfig: {},
      teamId: user.teamId,
      tmbId: user.tmbId
    });
    await expect(MongoApp.findById(appId).lean()).resolves.toMatchObject({
      resourceRefs: { skillIds: [String(publishedSkill._id)] }
    });

    const draftSaveRes = await Call(publishHandler, {
      auth: user,
      query: { appId },
      body: {
        nodes: [createSkillNode(draftSkill)],
        edges: [],
        chatConfig: {},
        isPublish: false,
        versionName: 'draft'
      }
    });
    expect(draftSaveRes.code).toBe(200);
    await expect(MongoApp.findById(appId).lean()).resolves.toMatchObject({
      resourceRefs: { skillIds: [String(publishedSkill._id)] }
    });

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
        nodes: [createSkillNode(draftSkill)],
        edges: [],
        chatConfig: {},
        isPublish: true,
        versionName: 'publish draft'
      }
    });
    expect(publishRes.code).toBe(200);
    await expect(MongoApp.findById(appId).lean()).resolves.toMatchObject({
      resourceRefs: { skillIds: [String(draftSkill._id)] }
    });

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

    const latestPublishedVersion = await MongoAppVersion.findOne({
      appId,
      isPublish: true
    })
      .sort({ time: -1, _id: -1 })
      .lean();
    expect(latestPublishedVersion?.resourceRefs?.skillIds).toEqual([String(draftSkill._id)]);
    await MongoApp.updateOne({ _id: appId }, { $set: { resourceRefs: { skillIds: [] } } });
    const clearedAppRefsRes = await Call<
      ListSkillsQuery,
      Record<string, never>,
      ListSkillsResponse
    >(handler, {
      auth: user,
      body: {
        source: 'mine',
        parentId: null
      }
    });
    const getClearedAppRefsCount = (skillId: string) =>
      clearedAppRefsRes.data.list.find((item) => String(item._id) === skillId)?.appCount;
    expect(getClearedAppRefsCount(String(publishedSkill._id))).toBe(0);
    expect(getClearedAppRefsCount(String(draftSkill._id))).toBe(0);
  });
});
