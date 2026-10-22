import hydrateHandler from '@/pages/api/core/app/hydrateWorkflow';
import { onCreateApp } from '@/pages/api/core/app/create';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { AppVersionSchemaType } from '@fastgpt/global/core/app/version/type';
import type {
  HydrateWorkflowBodyType,
  HydrateWorkflowResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

const missingNodeIds = () => ({
  skillId: String(new Types.ObjectId()),
  toolId: String(new Types.ObjectId())
});

const createImportNodes = ({
  skillId,
  toolId
}: {
  skillId: string;
  toolId: string;
}): AppVersionSchemaType['nodes'] =>
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
          value: [{ skillId, name: 'Gone skill' }]
        },
        {
          key: NodeInputKeyEnum.selectedTools,
          label: '',
          renderTypeList: [FlowNodeInputTypeEnum.selectTool],
          selectedType: FlowNodeInputTypeEnum.selectTool,
          value: [{ id: toolId, name: 'Gone tool', config: {} }]
        }
      ],
      outputs: []
    }
  ] as unknown as AppVersionSchemaType['nodes'];

describe('hydrate workflow api', () => {
  it('marks imported missing skill and tool as deleted', async () => {
    const [user] = (await getFakeUsers(1)).members;
    const { skillId, toolId } = missingNodeIds();
    const appId = await onCreateApp({
      name: 'hydrate imported app',
      type: AppTypeEnum.workflow,
      teamId: user.teamId,
      tmbId: user.tmbId,
      allowUnauthorizedResources: true,
      nodes: createImportNodes({ skillId, toolId })
    });
    const version = await MongoAppVersion.findOne({ appId }).lean();

    const res = await Call<
      HydrateWorkflowBodyType,
      Record<string, never>,
      HydrateWorkflowResponseType
    >(hydrateHandler, {
      auth: user,
      headers: {},
      body: {
        appId,
        nodes: version!.nodes
      }
    });

    expect(res.error).toBeUndefined();
    const agentNode = res.data!.nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.agent)!;
    const skills = agentNode.inputs.find((input) => input.key === NodeInputKeyEnum.skills)
      ?.value as any[];
    const tools = agentNode.inputs.find((input) => input.key === NodeInputKeyEnum.selectedTools)
      ?.value as any[];

    expect(skills[0]).toMatchObject({ skillId, name: 'Gone skill', error: 'resource_missing' });
    expect(tools[0].pluginData).toMatchObject({ error: 'tool_missing' });
    expect(tools[0]).toMatchObject({ name: 'Gone tool' });
  });

  it('rejects users without app write permission', async () => {
    const users = await getFakeUsers(2);
    const { skillId, toolId } = missingNodeIds();
    const appId = await onCreateApp({
      name: 'hydrate permission app',
      type: AppTypeEnum.workflow,
      teamId: users.members[0].teamId,
      tmbId: users.members[0].tmbId,
      allowUnauthorizedResources: true,
      nodes: createImportNodes({ skillId, toolId })
    });
    const version = await MongoAppVersion.findOne({ appId }).lean();

    const res = await Call<HydrateWorkflowBodyType, Record<string, never>>(hydrateHandler, {
      auth: users.members[1],
      headers: {},
      body: {
        appId,
        nodes: version!.nodes
      }
    });

    expect(res.error).toBe(AppErrEnum.unAuthApp);
  });
});
