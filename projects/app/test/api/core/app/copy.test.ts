import * as copyapi from '@/pages/api/core/app/copy';
import * as createapi from '@/pages/api/core/app/create';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { configureAgentQuota } from './quotaTestUtils';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type {
  CopyAppBodyType,
  CopyAppResponseType,
  CreateAppBodyType,
  CreateAppResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import {
  PerResourceTypeEnum,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { TeamAppCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getCachedSystemModelHandle } from '@fastgpt/service/core/ai/model/catalog/cache';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { serviceEnv } from '@fastgpt/service/env';
import { getResourceOwnedClbs } from '@fastgpt/service/support/permission/controller';
import { updateResourceCollaborators } from '@fastgpt/service/support/permission/resourcePermissionService';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import { getModelTestDefaults } from '@test/modelCache';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('Copy', () => {
  it('should return success', async () => {
    const users = await getFakeUsers(2);
    await MongoResourcePermission.create({
      resourceType: 'team',
      teamId: users.members[0].teamId,
      resourceId: null,
      tmbId: users.members[0].tmbId,
      permission: TeamAppCreatePermissionVal
    });

    const res = await Call<CreateAppBodyType, Record<string, never>, CreateAppResponseType>(
      createapi.default,
      {
        auth: users.members[0],
        body: {
          nodes: [],
          name: 'testfolder',
          type: AppTypeEnum.folder
        }
      }
    );
    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
    const folderId = res.data as string;

    const res2 = await Call<CreateAppBodyType, Record<string, never>, CreateAppResponseType>(
      createapi.default,
      {
        auth: users.members[0],
        body: {
          nodes: [],
          parentId: folderId,
          name: 'simple app',
          type: AppTypeEnum.simple
        }
      }
    );
    expect(res2.error).toBeUndefined();
    expect(res2.code).toBe(200);
    const appId = res2.data as string;
    await MongoAppVersion.updateOne(
      { appId, isPublish: true },
      {
        $set: {
          nodes: [
            {
              nodeId: 'chat-node',
              flowNodeType: FlowNodeTypeEnum.chatNode,
              name: 'Chat',
              inputs: [
                {
                  key: NodeInputKeyEnum.aiModel,
                  value: 'disabled-copy-model',
                  selectedType: FlowNodeInputTypeEnum.selectLLMModel,
                  renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
                }
              ],
              outputs: []
            }
          ]
        }
      }
    );

    const res3 = await Call<CopyAppBodyType, Record<string, never>, CopyAppResponseType>(
      copyapi.default,
      {
        auth: users.members[1],
        body: {
          appId
        }
      }
    );
    expect(res3.error).toBe(AppErrEnum.unAuthApp);
    expect(res3.code).toBe(500);

    await mongoSessionRun(async (session) => {
      const folder = await MongoApp.findById(folderId).lean();
      if (!folder) throw new Error('Test folder was not created');

      const oldCollaborators = await getResourceOwnedClbs({
        resourceType: 'app',
        teamId: String(folder.teamId),
        resourceId: folderId,
        session
      });

      await updateResourceCollaborators({
        resource: folder,
        resourceModel: MongoApp,
        resourceType: PerResourceTypeEnum.app,
        oldCollaborators,
        newCollaborators: [
          ...oldCollaborators,
          { tmbId: String(users.members[1].tmbId), permission: WritePermissionVal }
        ],
        session
      });
    });

    const res4 = await Call<CopyAppBodyType, Record<string, never>, CopyAppResponseType>(
      copyapi.default,
      {
        auth: users.members[1],
        body: {
          appId
        }
      }
    );
    expect(res4.error).toBeUndefined();
    expect(res4.code).toBe(200);
    const copiedVersion = await MongoAppVersion.findOne({
      appId: res4.data?.appId,
      isPublish: true
    }).lean();
    const expectedFallbackModelId =
      getModelTestDefaults().llm?.modelId ??
      getCachedSystemModelHandle()
        ?.getActiveModels()
        .find((model) => model.type === ModelTypeEnum.llm)?.modelId;
    expect(copiedVersion?.nodes[0].inputs).toEqual([
      expect.objectContaining({
        key: NodeInputKeyEnum.aiModelId,
        value: expectedFallbackModelId
      })
    ]);
  });

  it.each([AppTypeEnum.simple, AppTypeEnum.chatAgent, AppTypeEnum.workflow])(
    'allows the tenth Agent and rejects further copies of %s without writing resources',
    async (type) => {
      configureAgentQuota();
      const { owner } = await getFakeUsers(0);
      const created = await Call<CreateAppBodyType, Record<string, never>, CreateAppResponseType>(
        createapi.default,
        { auth: owner, body: { name: 'source', type, nodes: [] } }
      );
      expect(created.code).toBe(200);
      await MongoApp.insertMany(
        Array.from({ length: 8 }, () => ({
          teamId: owner.teamId,
          tmbId: owner.tmbId,
          name: 'existing Agent',
          type
        }))
      );

      const copy = () =>
        Call<CopyAppBodyType, Record<string, never>, CopyAppResponseType>(copyapi.default, {
          auth: owner,
          body: { appId: created.data }
        });
      expect((await copy()).code).toBe(200);
      const countResources = () =>
        Promise.all([
          MongoApp.countDocuments({ teamId: owner.teamId }),
          MongoAppVersion.countDocuments(),
          MongoResourcePermission.countDocuments()
        ]);
      const before = await countResources();
      const denied = await copy();
      expect(denied.error).toBe(TeamErrEnum.appAmountNotEnough);
      expect(await countResources()).toEqual(before);
      expect(before[0]).toBe(10);

      // 同一份限额也约束普通创建；历史上已超额的团队继续被拒绝。
      const createDenied = await Call<CreateAppBodyType>(createapi.default, {
        auth: owner,
        body: { name: 'eleventh', type, nodes: [] }
      });
      expect(createDenied.error).toBe(TeamErrEnum.appAmountNotEnough);
      await MongoApp.create({
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        name: 'legacy excess',
        type
      });
      expect((await copy()).error).toBe(TeamErrEnum.appAmountNotEnough);
    }
  );

  it.each([AppTypeEnum.workflowTool, AppTypeEnum.mcpToolSet, AppTypeEnum.httpToolSet])(
    'uses the tool quota when copying %s even when the Agent quota is full',
    async (type) => {
      configureAgentQuota();
      const { owner } = await getFakeUsers(0);
      await MongoApp.insertMany(
        Array.from({ length: 10 }, () => ({
          teamId: owner.teamId,
          tmbId: owner.tmbId,
          name: 'Agent',
          type: AppTypeEnum.chatAgent
        }))
      );
      const sourceId = await createapi.onCreateApp({
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        name: 'tool',
        type,
        nodes: []
      });
      const copy = () =>
        Call<CopyAppBodyType, Record<string, never>, CopyAppResponseType>(copyapi.default, {
          auth: owner,
          body: { appId: sourceId }
        });
      expect((await copy()).code).toBe(200);
      await MongoApp.insertMany(
        Array.from({ length: 998 }, () => ({
          teamId: owner.teamId,
          tmbId: owner.tmbId,
          name: 'existing tool',
          type
        }))
      );
      expect((await copy()).error).toBe(TeamErrEnum.pluginAmountNotEnough);
      expect(await MongoApp.countDocuments({ teamId: owner.teamId, type })).toBe(1000);
    }
  );

  it.each([AppTypeEnum.folder, AppTypeEnum.toolFolder])(
    'uses the folder quota when copying %s even when the Agent quota is full',
    async (type) => {
      configureAgentQuota();
      const { owner } = await getFakeUsers(0);
      await MongoApp.insertMany(
        Array.from({ length: 10 }, () => ({
          teamId: owner.teamId,
          tmbId: owner.tmbId,
          name: 'Agent',
          type: AppTypeEnum.chatAgent
        }))
      );
      const sourceId = await createapi.onCreateApp({
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        name: 'folder',
        type
      });
      const copy = () =>
        Call<CopyAppBodyType, Record<string, never>, CopyAppResponseType>(copyapi.default, {
          auth: owner,
          body: { appId: sourceId }
        });
      expect((await copy()).code).toBe(200);
      await MongoApp.insertMany(
        Array.from({ length: serviceEnv.APP_FOLDER_MAX_AMOUNT - 2 }, () => ({
          teamId: owner.teamId,
          tmbId: owner.tmbId,
          name: 'existing folder',
          type
        }))
      );
      expect((await copy()).error).toBe(TeamErrEnum.appFolderAmountNotEnough);
      expect(await MongoApp.countDocuments({ teamId: owner.teamId, type })).toBe(
        serviceEnv.APP_FOLDER_MAX_AMOUNT
      );
    }
  );
});
