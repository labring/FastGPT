import * as createapi from '@/pages/api/core/app/create';
import * as transitionapi from '@/pages/api/core/app/transitionWorkflow';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type {
  CreateAppBodyType,
  CreateAppResponseType,
  TransitionWorkflowBodyType,
  TransitionWorkflowResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import { TeamAppCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

const historicalModules = [
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
];

describe('Transition workflow', () => {
  it.each([false, true])('writes canonical workflow when createNew is %s', async (createNew) => {
    const [user] = (await getFakeUsers(1)).members;
    await MongoResourcePermission.create({
      resourceType: 'team',
      teamId: user.teamId,
      resourceId: null,
      tmbId: user.tmbId,
      permission: TeamAppCreatePermissionVal
    });
    const createResult = await Call<
      CreateAppBodyType,
      Record<string, never>,
      CreateAppResponseType
    >(createapi.default, {
      auth: user,
      body: { name: 'simple app', type: AppTypeEnum.simple, nodes: [] }
    });
    const sourceAppId = createResult.data!;
    const copiedResources = [{ type: 'skill' as const, id: 'copied-skill' }];
    await MongoAppVersion.updateOne(
      { appId: sourceAppId },
      { nodes: historicalModules, resources: copiedResources }
    );

    const result = await Call<
      TransitionWorkflowBodyType,
      Record<string, never>,
      TransitionWorkflowResponseType
    >(transitionapi.default, {
      auth: user,
      body: { appId: sourceAppId, createNew }
    });
    const appId = createNew ? result.data?.id : sourceAppId;
    const [app, version] = await Promise.all([
      MongoApp.findById(appId).lean(),
      createNew
        ? MongoAppVersion.findOne({ appId }).lean()
        : MongoAppVersion.findOne({ appId, isAutoSave: true }).lean()
    ]);
    const input = version?.nodes[0]?.inputs[0];

    expect(result.code).toBe(200);
    expect(app?.type).toBe(AppTypeEnum.workflow);
    expect(input?.selectedType).toBe(FlowNodeInputTypeEnum.reference);
    expect(input).not.toHaveProperty('selectedTypeIndex');
    if (!createNew) {
      expect(version?.resources).toEqual(copiedResources);
    }
  });
});
