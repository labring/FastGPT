import * as createapi from '@/pages/api/core/app/create';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { AppVersionSchemaType } from '@fastgpt/global/core/app/version/type';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { CreateAppBodyType } from '@fastgpt/global/openapi/core/app/common/api';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { TeamAppCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { MongoAppTemplate } from '@fastgpt/service/core/app/templates/templateSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

type EmptyRequestParams = Record<string, never>;

describe('create api', () => {
  it('should return 200 when create app success', async () => {
    const users = await getFakeUsers(2);
    await MongoResourcePermission.findOneAndUpdate(
      {
        resourceType: 'team',
        teamId: users.members[0].teamId,
        resourceId: null,
        tmbId: users.members[0].tmbId
      },
      {
        permission: TeamAppCreatePermissionVal
      },
      { upsert: true }
    );

    const res = await Call<CreateAppBodyType, EmptyRequestParams, string>(createapi.default, {
      auth: users.members[0],
      body: {
        nodes: [],
        name: 'testfolder',
        type: AppTypeEnum.folder
      }
    });
    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
    const folderId = res.data as string;

    const res2 = await Call<CreateAppBodyType, EmptyRequestParams, string>(createapi.default, {
      auth: users.members[0],
      body: {
        nodes: [],
        name: 'testapp',
        type: AppTypeEnum.simple,
        parentId: String(folderId)
      }
    });
    expect(res2.error).toBeUndefined();
    expect(res2.code).toBe(200);
    expect(res2.data).toBeDefined();

    const res3 = await Call<CreateAppBodyType, EmptyRequestParams, string>(createapi.default, {
      auth: users.members[1],
      body: {
        nodes: [],
        name: 'testapp',
        type: AppTypeEnum.simple,
        parentId: String(folderId)
      }
    });
    expect(res3.error).toBe(AppErrEnum.unAuthApp);
    expect(res3.code).toBe(500);

    await MongoResourcePermission.findOneAndUpdate(
      {
        resourceType: 'app',
        teamId: users.members[1].teamId,
        resourceId: String(folderId),
        tmbId: users.members[1].tmbId
      },
      {
        permission: WritePermissionVal
      },
      { upsert: true }
    );

    const res4 = await Call<CreateAppBodyType, EmptyRequestParams, string>(createapi.default, {
      auth: users.members[1],
      body: {
        nodes: [],
        name: 'testapp',
        type: AppTypeEnum.simple,
        parentId: String(folderId)
      }
    });
    expect(res4.error).toBeUndefined();
    expect(res4.code).toBe(200);
    expect(res4.data).toBeDefined();
  });

  it('keeps community template avatar from plugin detail when database has stale avatar', async () => {
    const users = await getFakeUsers(1);
    await MongoResourcePermission.findOneAndUpdate(
      {
        resourceType: 'team',
        teamId: users.members[0].teamId,
        resourceId: null,
        tmbId: users.members[0].tmbId
      },
      {
        permission: TeamAppCreatePermissionVal
      },
      { upsert: true }
    );

    const templateId = `${AppToolSourceEnum.community}-githubIssue`;
    await MongoAppTemplate.create({
      templateId,
      avatar: '/stale-db-avatar.png'
    });

    const res = await Call<CreateAppBodyType, EmptyRequestParams, string>(createapi.default, {
      auth: users.members[0],
      body: {
        nodes: [],
        name: 'community template app',
        avatar: '/plugin-avatar.png',
        type: AppTypeEnum.workflow,
        templateId
      }
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
    const app = await MongoApp.findById(res.data).lean();
    expect(app?.avatar).toBe('/plugin-avatar.png');
  });

  it('migrates historical workflow before creating app and initial version', async () => {
    const [user] = (await getFakeUsers(1)).members;
    const appId = await createapi.onCreateApp({
      name: 'historical workflow',
      type: AppTypeEnum.workflow,
      teamId: user.teamId,
      tmbId: user.tmbId,
      nodes: [
        {
          nodeId: 'start-1',
          flowNodeType: 'workflowStart',
          name: 'Start',
          inputs: [
            {
              key: 'query',
              label: 'Query',
              renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
              selectedTypeIndex: 1
            }
          ],
          outputs: []
        }
      ] as unknown as AppVersionSchemaType['nodes']
    });

    const version = await MongoAppVersion.findOne({ appId }).lean();
    const rawApp = await MongoApp.collection.findOne(
      { _id: new Types.ObjectId(appId) },
      { projection: { modules: 1, edges: 1, chatConfig: 1 } }
    );
    const input = version?.nodes[0]?.inputs[0];

    expect(input?.selectedType).toBe(FlowNodeInputTypeEnum.reference);
    expect(input).not.toHaveProperty('selectedTypeIndex');
    expect(rawApp).not.toHaveProperty('modules');
    expect(rawApp).not.toHaveProperty('edges');
    expect(rawApp).not.toHaveProperty('chatConfig');
  });

  const createAgentImportNodes = ({ skillId, toolId }: { skillId: string; toolId: string }) =>
    [
      {
        nodeId: 'agent-1',
        flowNodeType: FlowNodeTypeEnum.agent,
        name: 'Agent',
        inputs: [
          {
            key: NodeInputKeyEnum.skills,
            label: '',
            renderTypeList: [FlowNodeInputTypeEnum.selectSkill],
            selectedType: FlowNodeInputTypeEnum.selectSkill,
            value: [{ skillId, name: 'Gone skill', avatar: 'skill-avatar' }]
          },
          {
            key: NodeInputKeyEnum.selectedTools,
            label: '',
            renderTypeList: [FlowNodeInputTypeEnum.selectTool],
            selectedType: FlowNodeInputTypeEnum.selectTool,
            value: [{ id: toolId, name: 'Gone tool', avatar: 'tool-avatar', config: {} }]
          }
        ],
        outputs: []
      }
    ] as unknown as AppVersionSchemaType['nodes'];

  it('allows importing missing agent resources when allowUnauthorizedResources is true', async () => {
    const [user] = (await getFakeUsers(1)).members;
    const skillId = String(new Types.ObjectId());
    const toolId = String(new Types.ObjectId());

    const appId = await createapi.onCreateApp({
      name: 'imported agent app',
      type: AppTypeEnum.workflow,
      teamId: user.teamId,
      tmbId: user.tmbId,
      allowUnauthorizedResources: true,
      nodes: createAgentImportNodes({ skillId, toolId })
    });

    const version = await MongoAppVersion.findOne({ appId }).lean();
    // 缺失资源不进入资源快照，但节点快照仍保留，由详情接口标记为已删除。
    expect(version?.resources).toEqual([]);
    const agentNode = version?.nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.agent);
    const skills = agentNode?.inputs.find((input) => input.key === NodeInputKeyEnum.skills)
      ?.value as any[];
    const tools = agentNode?.inputs.find((input) => input.key === NodeInputKeyEnum.selectedTools)
      ?.value as any[];

    expect(skills[0]).toMatchObject({ skillId, name: 'Gone skill' });
    expect(tools[0]).toMatchObject({ id: toolId, name: 'Gone tool', config: {} });
  });

  it('still rejects missing agent skills without allowUnauthorizedResources', async () => {
    const [user] = (await getFakeUsers(1)).members;

    await expect(
      createapi.onCreateApp({
        name: 'rejected agent app',
        type: AppTypeEnum.workflow,
        teamId: user.teamId,
        tmbId: user.tmbId,
        nodes: createAgentImportNodes({
          skillId: String(new Types.ObjectId()),
          toolId: String(new Types.ObjectId())
        })
      })
    ).rejects.toBe(SkillErrEnum.unExist);
  });
});
