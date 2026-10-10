import * as createapi from '@/pages/api/core/app/create';
import * as transitionapi from '@/pages/api/core/app/transitionWorkflow';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
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
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

const createHistoricalModules = (skillId: string) => [
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
      },
      {
        key: NodeInputKeyEnum.skills,
        renderTypeList: [FlowNodeInputTypeEnum.selectSkill],
        value: [{ skillId }]
      }
    ],
    outputs: []
  }
];

const referenceSnapshots = [
  {
    reference: ['deleted-node', 'output'] as [string, string],
    sourceLabel: 'Deleted node'
  }
];

describe('Transition workflow', () => {
  it.each([false, true])('writes canonical workflow when createNew is %s', async (createNew) => {
    const [user] = (await getFakeUsers(1)).members;
    const skill = await MongoAgentSkills.create({
      name: 'Transition skill',
      type: AgentSkillTypeEnum.skill,
      source: AgentSkillSourceEnum.personal,
      teamId: user.teamId,
      tmbId: user.tmbId
    });
    const skillId = String(skill._id);
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
      body: { name: 'simple app', type: AppTypeEnum.simple, modules: [] }
    });
    const sourceAppId = createResult.data!;
    await MongoApp.updateOne(
      { _id: sourceAppId },
      { modules: createHistoricalModules(skillId), referenceSnapshots }
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
      createNew ? MongoAppVersion.findOne({ appId }).lean() : undefined
    ]);
    const input = app?.modules[0]?.inputs[0];

    expect(result.code).toBe(200);
    expect(app?.type).toBe(AppTypeEnum.workflow);
    expect(app?.referenceSnapshots).toEqual(referenceSnapshots);
    expect(app?.resourceRefs?.skillIds).toEqual([skillId]);
    expect(input?.selectedType).toBe(FlowNodeInputTypeEnum.reference);
    expect(input).not.toHaveProperty('selectedTypeIndex');
    if (createNew) {
      expect(version?.nodes).toEqual(app?.modules);
      expect(version?.referenceSnapshots).toEqual(referenceSnapshots);
      expect(version?.resourceRefs?.skillIds).toEqual([skillId]);
    }
  });
});
