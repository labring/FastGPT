import * as copyapi from '@/pages/api/core/app/copy';
import * as createapi from '@/pages/api/core/app/create';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
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
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { TeamAppCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { getResourceOwnedClbs } from '@fastgpt/service/support/permission/controller';
import { updateResourceCollaborators } from '@fastgpt/service/support/permission/resourcePermissionService';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
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
        resourceType: 'app',
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
      global.systemDefaultModel.llm?.modelId ??
      global.systemActiveModelList.find((model) => model.type === ModelTypeEnum.llm)?.modelId;
    expect(copiedVersion?.nodes[0].inputs).toEqual([
      expect.objectContaining({
        key: NodeInputKeyEnum.aiModelId,
        value: expectedFallbackModelId
      })
    ]);
  });
});
