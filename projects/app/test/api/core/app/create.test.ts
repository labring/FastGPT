import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { serviceEnv } from '@fastgpt/service/env';
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
import { describe, expect, it, vi } from 'vitest';

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

  it('rejects creating an app under a tool folder and a tool under an app folder', async () => {
    const users = await getFakeUsers(1);
    const member = users.members[0];

    const appFolder = await MongoApp.create({
      name: 'app-folder',
      type: AppTypeEnum.folder,
      teamId: member.teamId,
      tmbId: member.tmbId
    });
    const toolFolder = await MongoApp.create({
      name: 'tool-folder',
      type: AppTypeEnum.toolFolder,
      teamId: member.teamId,
      tmbId: member.tmbId
    });

    // 普通应用不能放进工具文件夹
    const appIntoToolFolder = await Call<CreateAppBodyType, EmptyRequestParams, string>(
      createapi.default,
      {
        auth: member,
        body: {
          nodes: [],
          name: 'app-in-tool-folder',
          type: AppTypeEnum.simple,
          parentId: String(toolFolder._id)
        }
      }
    );
    expect(appIntoToolFolder.error).toBe(AppErrEnum.parentFolderTypeMismatch);

    // 工具不能放进普通应用文件夹
    const toolIntoAppFolder = await Call<CreateAppBodyType, EmptyRequestParams, string>(
      createapi.default,
      {
        auth: member,
        body: {
          nodes: [],
          name: 'tool-in-app-folder',
          type: AppTypeEnum.workflowTool,
          parentId: String(appFolder._id)
        }
      }
    );
    expect(toolIntoAppFolder.error).toBe(AppErrEnum.parentFolderTypeMismatch);

    // 同树创建仍然正常
    const validCreate = await Call<CreateAppBodyType, EmptyRequestParams, string>(
      createapi.default,
      {
        auth: member,
        body: {
          nodes: [],
          name: 'app-in-app-folder',
          type: AppTypeEnum.simple,
          parentId: String(appFolder._id)
        }
      }
    );
    expect(validCreate.error).toBeUndefined();
  });
});

describe('generic app creation folder depth', () => {
  it('validates a parent created in the same transaction', async () => {
    const { owner } = await getFakeUsers(1);
    const { mongoSessionRun } = await vi.importActual<
      typeof import('@fastgpt/service/common/mongo/sessionRun')
    >('@fastgpt/service/common/mongo/sessionRun');
    const props = { teamId: owner.teamId, tmbId: owner.tmbId, type: AppTypeEnum.folder };
    const childId = await mongoSessionRun(async (session) => {
      const parentId = await createapi.onCreateApp({ ...props, name: 'parent', session });
      return createapi.onCreateApp({ ...props, name: 'child', parentId, session });
    });
    expect((await MongoApp.findById(childId).lean())?.ancestorIds).toHaveLength(1);
  });

  it.each([AppTypeEnum.folder, AppTypeEnum.toolFolder])(
    'enforces the depth boundary for %s and still permits leaves',
    async (type) => {
      const { owner } = await getFakeUsers(1);
      const ids: string[] = [];
      for (let i = 0; i < serviceEnv.MAX_FOLDER_DEPTH - 1; i++) {
        const folder = await MongoApp.create({
          name: `level-${i}`,
          type,
          parentId: ids.at(-1) ?? null,
          teamId: owner.teamId,
          tmbId: owner.tmbId
        });
        ids.push(String(folder._id));
      }
      const lastFolder = await Call(createapi.default, {
        auth: owner,
        body: { name: 'last-folder', type, parentId: ids.at(-1) }
      });
      expect(lastFolder.code).toBe(200);
      expect((await MongoApp.findById(lastFolder.data).lean())?.ancestorIds.map(String)).toEqual(
        ids
      );
      const overflow = await Call(createapi.default, {
        auth: owner,
        body: { name: 'overflow', type, parentId: lastFolder.data }
      });
      expect(overflow.error).toBe(CommonErrEnum.folderDepthLimit);
      expect(await MongoApp.countDocuments({ name: 'overflow' })).toBe(0);
      const leaf = await Call(createapi.default, {
        auth: owner,
        body: {
          name: 'leaf',
          type: type === AppTypeEnum.folder ? AppTypeEnum.simple : AppTypeEnum.workflowTool,
          parentId: lastFolder.data
        }
      });
      expect(leaf.code).toBe(200);
      const historical = await MongoApp.create({
        name: 'historical-deep-folder',
        type,
        parentId: lastFolder.data,
        teamId: owner.teamId,
        tmbId: owner.tmbId
      });
      const deepLeaf = await Call(createapi.default, {
        auth: owner,
        body: {
          name: 'invalid-deep-leaf',
          type: type === AppTypeEnum.folder ? AppTypeEnum.simple : AppTypeEnum.workflowTool,
          parentId: String(historical._id)
        }
      });
      expect(deepLeaf.error).toBe(CommonErrEnum.folderDepthLimit);
      expect(await MongoApp.countDocuments({ name: 'invalid-deep-leaf' })).toBe(0);
    }
  );
});
