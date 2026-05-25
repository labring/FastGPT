import { describe, expect, it } from 'vitest';
import handler from '@/pages/api/admin/backfillAppResourceRefs';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';

const startTime = new Date('2026-05-24T00:00:00.000+08:00');
const beforeStartTime = new Date('2026-05-23T23:59:59.999+08:00');
const afterStartTime = new Date('2026-05-24T12:00:00.000+08:00');

const createSkillNode = (skillId: string): StoreNodeItemType =>
  ({
    nodeId: `node-${skillId}`,
    name: 'Agent',
    inputs: [
      {
        key: NodeInputKeyEnum.skills,
        renderTypeList: [FlowNodeInputTypeEnum.selectSkill],
        valueType: WorkflowIOValueTypeEnum.arrayObject,
        value: [{ skillId }]
      }
    ],
    outputs: []
  }) as StoreNodeItemType;

describe('GET /api/admin/backfillAppResourceRefs', () => {
  it('只回填 2026-05-24 之后的版本资源索引，不写 apps 表', async () => {
    const user = await getUser(`backfill-app-resource-refs-${getNanoid(6)}`);
    const oldSkillId = `old-skill-${getNanoid(6)}`;
    const newSkillId = `new-skill-${getNanoid(6)}`;
    const draftSkillId = `draft-skill-${getNanoid(6)}`;

    const [oldApp, newApp, draftOnlyApp] = await MongoApp.create([
      {
        name: 'Old App',
        type: AppTypeEnum.chatAgent,
        teamId: user.teamId,
        tmbId: user.tmbId,
        modules: [createSkillNode(oldSkillId)],
        edges: [],
        chatConfig: {},
        updateTime: afterStartTime
      },
      {
        name: 'New App',
        type: AppTypeEnum.chatAgent,
        teamId: user.teamId,
        tmbId: user.tmbId,
        modules: [createSkillNode(newSkillId)],
        edges: [],
        chatConfig: {},
        updateTime: afterStartTime
      },
      {
        name: 'Draft Only App',
        type: AppTypeEnum.chatAgent,
        teamId: user.teamId,
        tmbId: user.tmbId,
        modules: [createSkillNode(draftSkillId)],
        edges: [],
        chatConfig: {},
        updateTime: afterStartTime
      }
    ]);

    const [oldVersion, newVersion, draftVersion] = await MongoAppVersion.create([
      {
        appId: oldApp._id,
        tmbId: user.tmbId,
        nodes: [createSkillNode(oldSkillId)],
        edges: [],
        chatConfig: {},
        isPublish: true,
        versionName: 'old publish',
        time: beforeStartTime,
        resourceRefs: { skillIds: ['stale-old-version'] }
      },
      {
        appId: newApp._id,
        tmbId: user.tmbId,
        nodes: [createSkillNode(newSkillId)],
        edges: [],
        chatConfig: {},
        isPublish: true,
        versionName: 'new publish',
        time: afterStartTime,
        resourceRefs: { skillIds: ['stale-new-version'] }
      },
      {
        appId: draftOnlyApp._id,
        tmbId: user.tmbId,
        nodes: [createSkillNode(draftSkillId)],
        edges: [],
        chatConfig: {},
        isPublish: false,
        versionName: 'draft save',
        time: afterStartTime,
        resourceRefs: { skillIds: ['stale-draft-version'] }
      }
    ]);

    const res = await Call(handler, {
      auth: { ...user, isRoot: true },
      query: {
        dryRun: 'false',
        batchSize: '1'
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.startTime).toBe(startTime.toISOString());
    expect(res.data.versions.matched).toBe(2);
    expect(res.data.apps).toBeUndefined();

    const [updatedOldVersion, updatedNewVersion, updatedDraftVersion] = await Promise.all([
      MongoAppVersion.findById(oldVersion._id).lean(),
      MongoAppVersion.findById(newVersion._id).lean(),
      MongoAppVersion.findById(draftVersion._id).lean()
    ]);
    expect(updatedOldVersion?.resourceRefs?.skillIds).toEqual(['stale-old-version']);
    expect(updatedNewVersion?.resourceRefs?.skillIds).toEqual([newSkillId]);
    expect(updatedDraftVersion?.resourceRefs?.skillIds).toEqual([draftSkillId]);
  });
});
