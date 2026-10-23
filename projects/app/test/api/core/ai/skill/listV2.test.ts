import { getCachedSystemModelHandle } from '@fastgpt/service/core/ai/model/catalog/cache';

import handler from '@/pages/api/core/ai/skill/listV2';
import detailHandler from '@/pages/api/core/ai/skill/detail';
import folderPathHandler from '@/pages/api/core/ai/skill/folder/path';
import { onCreateApp } from '@/pages/api/core/app/create';
import publishHandler from '@/pages/api/core/app/version/publish';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type {
  GetSkillDetailQuery,
  GetSkillFolderPathQuery,
  GetSkillFolderPathResponse,
  ListSkillsResponse,
  ListSkillsV2Query
} from '@fastgpt/global/openapi/core/ai/skill/api';
import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { AppListSortEnum, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { Types } from '@fastgpt/service/common/mongo';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import * as resourceLookup from '@fastgpt/service/core/app/resourceLookup';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it, vi } from 'vitest';

describe('POST /api/core/ai/skill/listV2', () => {
  it.each(['pagination', 'ids'] as const)(
    'withAppCount=false skips reference queries in %s mode',
    async (mode) => {
      const user = await getUser(`skill-count-${getNanoid(6)}`);
      const skill = await MongoAgentSkills.create({
        name: 'Selectable skill',
        type: AgentSkillTypeEnum.skill,
        source: AgentSkillSourceEnum.personal,
        teamId: user.teamId,
        tmbId: user.tmbId
      });
      const countSpy = vi.spyOn(resourceLookup, 'countTeamAppsByPublishedResourceGroups');
      try {
        const result = await Call<ListSkillsV2Query, Record<string, never>, ListSkillsResponse>(
          handler,
          {
            auth: user,
            body: {
              source: 'mine',
              withAppCount: false,
              ...(mode === 'ids' ? { skillIds: [String(skill._id)] } : { parentId: null })
            }
          }
        );
        expect(result.code).toBe(200);
        expect(result.data.list).toHaveLength(1);
        expect(result.data.list[0]).not.toHaveProperty('appCount');
        expect(countSpy).not.toHaveBeenCalled();
      } finally {
        countSpy.mockRestore();
      }
    }
  );

  it('文件夹和 Skill 统一按修改时间混排', async () => {
    const owner = await getUser(`agent-skill-sort-owner-${getNanoid(6)}`);

    await MongoAgentSkills.create([
      {
        name: 'Older folder',
        type: AgentSkillTypeEnum.folder,
        source: AgentSkillSourceEnum.personal,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        updateTime: new Date('2026-01-01T00:00:00.000Z')
      },
      {
        name: 'Newer skill',
        type: AgentSkillTypeEnum.skill,
        source: AgentSkillSourceEnum.personal,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        updateTime: new Date('2026-02-01T00:00:00.000Z')
      },
      {
        name: 'Newest folder',
        type: AgentSkillTypeEnum.folder,
        source: AgentSkillSourceEnum.personal,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        updateTime: new Date('2026-03-01T00:00:00.000Z')
      }
    ]);

    const result = await Call<ListSkillsV2Query, Record<string, never>, ListSkillsResponse>(
      handler,
      {
        auth: owner,
        body: { source: 'mine', parentId: null }
      }
    );

    expect(result.data.list.every((item) => item.avatar === '/icon/logo.svg')).toBe(true);
    expect(result.data.list.find((item) => item.name === 'Newer skill')).toMatchObject({
      private: true,
      appCount: 0
    });
    expect(
      await MongoAgentSkills.countDocuments({ teamId: owner.teamId, avatar: { $exists: true } })
    ).toBe(0);
    expect(result.data.list.map((item) => item.name)).toEqual([
      'Newest folder',
      'Newer skill',
      'Older folder'
    ]);
    expect(
      result.data.list
        .filter((item) => item.type === AgentSkillTypeEnum.folder)
        .every((item) => item.appCount === undefined)
    ).toBe(true);
  });

  it('按创建者筛选并支持创建时间排序和空选择', async () => {
    const owner = await getUser(`agent-skill-filter-owner-${getNanoid(6)}`);
    const member = await getUser(`agent-skill-filter-member-${getNanoid(6)}`, owner.teamId);

    const [olderSkill, newerSkill] = await MongoAgentSkills.create([
      {
        name: 'Older member skill',
        type: AgentSkillTypeEnum.skill,
        source: AgentSkillSourceEnum.personal,
        teamId: owner.teamId,
        tmbId: member.tmbId,
        createTime: new Date('2026-01-01T00:00:00.000Z')
      },
      {
        name: 'Newer member skill',
        type: AgentSkillTypeEnum.skill,
        source: AgentSkillSourceEnum.personal,
        teamId: owner.teamId,
        tmbId: member.tmbId,
        createTime: new Date('2026-02-01T00:00:00.000Z')
      },
      {
        name: 'Owner skill',
        type: AgentSkillTypeEnum.skill,
        source: AgentSkillSourceEnum.personal,
        teamId: owner.teamId,
        tmbId: owner.tmbId
      }
    ]);

    const filtered = await Call<ListSkillsV2Query, Record<string, never>, ListSkillsResponse>(
      handler,
      {
        auth: owner,
        body: {
          source: 'mine',
          parentId: null,
          tmbIds: [String(member.tmbId)],
          sort: AppListSortEnum.createTimeAsc
        }
      }
    );
    expect(filtered.code).toBe(200);
    expect(filtered.data.list.map((item) => String(item._id))).toEqual([
      String(olderSkill._id),
      String(newerSkill._id)
    ]);

    const empty = await Call<ListSkillsV2Query, Record<string, never>, ListSkillsResponse>(
      handler,
      {
        auth: owner,
        body: { source: 'mine', parentId: null, tmbIds: [] }
      }
    );
    expect(empty.data).toEqual({ list: [], total: 0 });
  });

  it('V2 returns a paginated result', async () => {
    const user = await getUser(`agent-skill-list-v2-${getNanoid(6)}`);
    await MongoAgentSkills.create(
      [3, 2, 1].map((index) => ({
        name: `Paged Skill ${index}`,
        type: AgentSkillTypeEnum.skill,
        source: AgentSkillSourceEnum.personal,
        teamId: user.teamId,
        tmbId: user.tmbId,
        updateTime: new Date(`2024-01-0${index}T00:00:00.000Z`)
      }))
    );
    const res = await Call<ListSkillsV2Query, Record<string, never>, ListSkillsResponse>(handler, {
      auth: user,
      body: { source: 'mine', page: 2, pageSize: 1 }
    });

    expect(res.code).toBe(200);
    expect(res.data.total).toBe(3);
    expect(res.data.list).toHaveLength(1);
    expect(res.data.list[0].name).toBe('Paged Skill 2');
  });

  it('omits skill folder counts and counts direct references for child skills', async () => {
    const user = await getUser(`agent-skill-folder-count-${getNanoid(6)}`);
    const folderId = new Types.ObjectId();
    const skillId = new Types.ObjectId();
    const appId = new Types.ObjectId();
    const publishedVersionId = new Types.ObjectId();

    await MongoAgentSkills.create([
      {
        _id: folderId,
        name: 'Skill folder',
        type: AgentSkillTypeEnum.folder,
        source: AgentSkillSourceEnum.personal,
        teamId: user.teamId,
        tmbId: user.tmbId,
        parentId: null
      },
      {
        _id: skillId,
        name: 'Referenced skill',
        type: AgentSkillTypeEnum.skill,
        source: AgentSkillSourceEnum.personal,
        teamId: user.teamId,
        tmbId: user.tmbId,
        parentId: folderId
      }
    ]);
    await MongoApp.create({
      _id: appId,
      name: 'App referencing skill',
      type: AppTypeEnum.workflow,
      teamId: user.teamId,
      tmbId: user.tmbId,
      parentId: null,
      publishedVersionId,
      deleteTime: null
    });
    await MongoAppVersion.collection.insertOne({
      _id: publishedVersionId,
      appId,
      tmbId: new Types.ObjectId(user.tmbId),
      time: new Date(),
      isPublish: true,
      resources: [{ type: 'skill', id: String(skillId) }]
    });

    const folderResponse = await Call<ListSkillsV2Query, Record<string, never>, ListSkillsResponse>(
      handler,
      { auth: user, body: { source: 'mine', parentId: null } }
    );
    const folder = folderResponse.data.list.find((item) => String(item._id) === String(folderId));
    expect(folder).toBeDefined();
    expect(folder).not.toHaveProperty('appCount');

    const childResponse = await Call<ListSkillsV2Query, Record<string, never>, ListSkillsResponse>(
      handler,
      {
        auth: user,
        body: { source: 'mine', parentId: String(folderId) }
      }
    );
    expect(
      childResponse.data.list.find((item) => String(item._id) === String(skillId))
    ).toMatchObject({ appCount: 1 });
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
    await MongoResourcePermission.create([
      {
        resourceType: PerResourceTypeEnum.agentSkill,
        teamId: owner.teamId,
        resourceId: ownedSkill._id,
        tmbId: member.tmbId,
        permission: OwnerRoleVal
      },
      {
        resourceType: PerResourceTypeEnum.agentSkill,
        teamId: owner.teamId,
        resourceId: protectedSkill._id,
        tmbId: owner.tmbId,
        permission: OwnerRoleVal
      }
    ]);

    const res = await Call<ListSkillsV2Query, Record<string, never>, ListSkillsResponse>(handler, {
      auth: member,
      body: {
        source: 'mine',
        skillIds: [String(ownedSkill._id), String(protectedSkill._id)]
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.list.map((item) => String(item._id))).toEqual([String(ownedSkill._id)]);
  });

  it('按 skillIds 查询时读取子资源自身的完整 ACL', async () => {
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
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.agentSkill,
      teamId: owner.teamId,
      resourceId: inheritedSkill._id,
      tmbId: owner.tmbId,
      permission: OwnerRoleVal
    });
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.agentSkill,
      teamId: owner.teamId,
      resourceId: inheritedSkill._id,
      tmbId: member.tmbId,
      permission: ReadPermissionVal
    });

    const res = await Call<ListSkillsV2Query, Record<string, never>, ListSkillsResponse>(handler, {
      auth: member,
      body: {
        source: 'mine',
        skillIds: [String(inheritedSkill._id)]
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.list.map((item) => String(item._id))).toEqual([String(inheritedSkill._id)]);
    expect(res.data.list[0]?.appCount).toBeUndefined();
    expect(res.data.list[0]?.private).toBe(false);
  });

  it('appCount 基于已发布版本的 resources，草稿保存不影响统计', async () => {
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
      nodes: [createSkillNode(publishedSkill)],
      edges: [],
      chatConfig: {},
      teamId: user.teamId,
      tmbId: user.tmbId
    });

    const legacyModel = getCachedSystemModelHandle()
      ?.getActiveModels()
      .find((model) => model.type === ModelTypeEnum.llm)!;
    const draftNode = createSkillNode(draftSkill);
    draftNode.inputs.push({
      key: NodeInputKeyEnum.aiModel,
      label: 'Model',
      value: legacyModel.model,
      renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel],
      valueType: WorkflowIOValueTypeEnum.string
    });

    const draftSaveRes = await Call(publishHandler, {
      auth: user,
      query: { appId },
      body: {
        nodes: [draftNode],
        edges: [],
        chatConfig: {},
        isPublish: false,
        versionName: 'draft'
      }
    });
    expect(draftSaveRes.code).toBe(200);
    const draftVersion = await MongoAppVersion.findOne({ appId, versionName: 'draft' }).lean();
    expect(draftVersion?.nodes[0].inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: NodeInputKeyEnum.aiModelId,
          value: legacyModel.modelId
        })
      ])
    );
    expect(
      draftVersion?.nodes[0].inputs.some((input) => input.key === NodeInputKeyEnum.aiModel)
    ).toBe(false);

    const invalidDraftNode = createSkillNode(draftSkill);
    invalidDraftNode.inputs.push(
      {
        key: NodeInputKeyEnum.aiModelId,
        label: 'Model ID',
        value: 'invalid-model-id',
        renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel],
        valueType: WorkflowIOValueTypeEnum.string
      },
      {
        key: NodeInputKeyEnum.aiModel,
        label: 'Legacy model',
        value: legacyModel.model,
        renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel],
        valueType: WorkflowIOValueTypeEnum.string
      }
    );
    const invalidDraftSaveRes = await Call(publishHandler, {
      auth: user,
      query: { appId },
      body: {
        nodes: [invalidDraftNode],
        edges: [],
        chatConfig: {},
        isPublish: false,
        versionName: 'invalid model draft'
      }
    });
    expect(invalidDraftSaveRes.code).toBe(200);
    const invalidDraftVersion = await MongoAppVersion.findOne({
      appId,
      versionName: 'invalid model draft'
    }).lean();
    expect(invalidDraftVersion?.nodes[0].inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: NodeInputKeyEnum.aiModelId,
          value: 'invalid-model-id'
        })
      ])
    );
    expect(
      invalidDraftVersion?.nodes[0].inputs.some((input) => input.key === NodeInputKeyEnum.aiModel)
    ).toBe(false);

    const invalidPublishRes = await Call(publishHandler, {
      auth: user,
      query: { appId },
      body: {
        nodes: [invalidDraftNode],
        edges: [],
        chatConfig: {},
        isPublish: true,
        versionName: 'invalid model publish'
      }
    });
    expect(invalidPublishRes.code).toBe(500);

    const draftRes = await Call<ListSkillsV2Query, Record<string, never>, ListSkillsResponse>(
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

    const publishedRes = await Call<ListSkillsV2Query, Record<string, never>, ListSkillsResponse>(
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

  it('lists navigable folders and limits a search to the current folder subtree', async () => {
    const owner = await getUser(`agent-skill-navigation-owner-${getNanoid(6)}`);
    const member = await getUser(`agent-skill-navigation-member-${getNanoid(6)}`, owner.teamId);
    const rootFolder = await MongoAgentSkills.create({
      name: 'Accessible tree',
      type: AgentSkillTypeEnum.folder,
      source: AgentSkillSourceEnum.personal,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    const childFolder = await MongoAgentSkills.create({
      name: 'Nested folder',
      type: AgentSkillTypeEnum.folder,
      source: AgentSkillSourceEnum.personal,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      parentId: rootFolder._id
    });
    const otherFolder = await MongoAgentSkills.create({
      name: 'Other tree',
      type: AgentSkillTypeEnum.folder,
      source: AgentSkillSourceEnum.personal,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    const hiddenFolder = await MongoAgentSkills.create({
      name: 'Hidden empty',
      type: AgentSkillTypeEnum.folder,
      source: AgentSkillSourceEnum.personal,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    const [nestedSkill, unrelatedSkill] = await MongoAgentSkills.create([
      {
        name: 'Shared needle',
        type: AgentSkillTypeEnum.skill,
        source: AgentSkillSourceEnum.personal,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        parentId: childFolder._id
      },
      {
        name: 'Shared needle elsewhere',
        type: AgentSkillTypeEnum.skill,
        source: AgentSkillSourceEnum.personal,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        parentId: otherFolder._id
      }
    ]);
    await MongoResourcePermission.create(
      [nestedSkill, unrelatedSkill].map((skill) => ({
        resourceType: PerResourceTypeEnum.agentSkill,
        teamId: owner.teamId,
        resourceId: skill._id,
        tmbId: member.tmbId,
        permission: ReadPermissionVal
      }))
    );

    const rootList = await Call<ListSkillsV2Query, Record<string, never>, ListSkillsResponse>(
      handler,
      { auth: member, body: { source: 'mine', parentId: null, withAppCount: false } }
    );
    expect(rootList.code).toBe(200);
    expect(
      rootList.data.list
        .filter((item) => item.folderAccessMode === 'navigate')
        .map((item) => item.name)
    ).toEqual(expect.arrayContaining(['Accessible tree', 'Other tree']));
    expect(rootList.data.list.map((item) => item.name)).not.toContain('Hidden empty');

    const emptyRootList = await Call<ListSkillsV2Query, Record<string, never>, ListSkillsResponse>(
      handler,
      { auth: member, body: { source: 'mine', parentId: '', withAppCount: false } }
    );
    expect(emptyRootList.code).toBe(200);
    expect(emptyRootList.data.list.map((item) => String(item._id))).toEqual(
      rootList.data.list.map((item) => String(item._id))
    );

    const skillsOnlyList = await Call<ListSkillsV2Query, Record<string, never>, ListSkillsResponse>(
      handler,
      {
        auth: member,
        body: {
          source: 'mine',
          parentId: null,
          type: AgentSkillTypeEnum.skill,
          withAppCount: false
        }
      }
    );
    expect(skillsOnlyList.data.list.every((item) => item.folderAccessMode === undefined)).toBe(
      true
    );

    const nestedList = await Call<ListSkillsV2Query, Record<string, never>, ListSkillsResponse>(
      handler,
      {
        auth: member,
        body: {
          source: 'mine',
          parentId: String(rootFolder._id),
          searchKey: 'Shared needle',
          withAppCount: false
        }
      }
    );
    expect(nestedList.code).toBe(200);
    expect(nestedList.data.list.map((item) => String(item._id))).toEqual([String(nestedSkill._id)]);

    const folderPath = await Call<
      Record<string, never>,
      GetSkillFolderPathQuery,
      GetSkillFolderPathResponse
    >(folderPathHandler, {
      auth: member,
      query: { sourceId: String(childFolder._id), type: 'current' }
    });
    expect(folderPath.code).toBe(200);
    expect(folderPath.data.at(-1)).toEqual({
      parentId: String(childFolder._id),
      parentName: 'Nested folder',
      folderAccessMode: 'navigate'
    });

    const deniedList = await Call<ListSkillsV2Query, Record<string, never>, ListSkillsResponse>(
      handler,
      {
        auth: member,
        body: { source: 'mine', parentId: String(hiddenFolder._id), withAppCount: false }
      }
    );
    expect(deniedList.error).toBe(SkillErrEnum.unAuthSkill);

    const deniedPath = await Call<
      Record<string, never>,
      GetSkillFolderPathQuery,
      GetSkillFolderPathResponse
    >(folderPathHandler, {
      auth: member,
      query: { sourceId: String(hiddenFolder._id), type: 'current' }
    });
    expect(deniedPath.error).toBe(SkillErrEnum.unAuthSkill);

    const deniedDetail = await Call<
      Record<string, never>,
      GetSkillDetailQuery,
      Record<string, never>
    >(detailHandler, {
      auth: member,
      query: { skillId: String(childFolder._id) }
    });
    expect(deniedDetail.error).toBe(SkillErrEnum.unAuthSkill);
  });

  it('普通查询默认返回 20 条，按 ID 跨目录返回全部匹配项并排除已删除资源', async () => {
    const user = await getUser(`skill-v2-ids-${getNanoid(6)}`);
    const parentId = new Types.ObjectId();
    const skills = await MongoAgentSkills.create(
      Array.from({ length: 51 }, (_, index) => ({
        name: `Selected Skill ${index}`,
        type: AgentSkillTypeEnum.skill,
        source: AgentSkillSourceEnum.personal,
        teamId: user.teamId,
        tmbId: user.tmbId,
        parentId: index % 2 ? parentId : null
      }))
    );
    const deleted = await MongoAgentSkills.create({
      name: 'Deleted',
      type: AgentSkillTypeEnum.skill,
      source: AgentSkillSourceEnum.personal,
      teamId: user.teamId,
      tmbId: user.tmbId,
      deleteTime: new Date()
    });
    const ids = skills.map((skill) => String(skill._id));
    const page = await Call<ListSkillsV2Query, Record<string, never>, ListSkillsResponse>(handler, {
      auth: user,
      body: { source: 'mine', searchKey: 'Selected Skill' }
    });
    expect(page.code).toBe(200);
    expect(page.data.total).toBe(51);
    expect(page.data.list).toHaveLength(20);

    const response = await Call<unknown, Record<string, never>, ListSkillsResponse>(handler, {
      auth: user,
      body: {
        skillIds: [...ids, ids[0], String(deleted._id), String(new Types.ObjectId())],
        source: 'mine',
        parentId: String(new Types.ObjectId()),
        page: 3,
        pageSize: 1,
        offset: 1000
      }
    });

    expect(response.code).toBe(200);
    expect(response.data.total).toBe(51);
    expect(response.data.list.map((skill) => String(skill._id)).sort()).toEqual([...ids].sort());
  });

  it('无效 skillIds 不会回退为分页查询', async () => {
    const response = await Call(handler, {
      body: { skillIds: [], parentId: null, pageSize: 20 }
    });
    expect(response.error).toBeInstanceOf(ApiRequestInputParseError);
  });
});
