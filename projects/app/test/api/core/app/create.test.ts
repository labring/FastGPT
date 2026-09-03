import * as createapi from '@/pages/api/core/app/create';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { AppVersionSchemaType } from '@fastgpt/global/core/app/version/type';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
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
});
