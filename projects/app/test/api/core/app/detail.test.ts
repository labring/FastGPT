import handler from '@/pages/api/core/app/detail';
import { onCreateApp } from '@/pages/api/core/app/create';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type {
  GetAppDetailQueryType,
  GetAppDetailResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers, getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('get app detail api', () => {
  it('returns draft workflow as nodes', async () => {
    const [owner] = (await getFakeUsers(1)).members;
    const appId = await onCreateApp({
      name: 'detail nodes app',
      intro: '',
      type: AppTypeEnum.workflow,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      nodes: [
        {
          nodeId: 'start-1',
          flowNodeType: 'workflowStart',
          name: 'Start',
          inputs: [
            {
              key: 'query',
              label: 'Query',
              renderTypeList: [FlowNodeInputTypeEnum.input]
            }
          ],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: { welcomeText: 'hello' }
    });

    const res = await Call<Record<string, never>, GetAppDetailQueryType, GetAppDetailResponseType>(
      handler,
      {
        auth: owner,
        headers: {},
        query: { appId }
      }
    );

    expect(res.code).toBe(200);
    expect(res.data.nodes.map((node) => node.nodeId)).toEqual(['start-1']);
    expect(res.data).not.toHaveProperty('modules');
  });

  it('does not expose workflow configuration to a read-only collaborator', async () => {
    const owner = await getUser(`detail-owner-${getNanoid(6)}`);
    const reader = await getUser(`detail-reader-${getNanoid(6)}`, owner.teamId);
    const appId = await onCreateApp({
      name: 'private workflow config',
      intro: '',
      type: AppTypeEnum.workflow,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      nodes: [
        {
          nodeId: 'start-1',
          flowNodeType: 'workflowStart',
          name: 'Start',
          inputs: [],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: {
        instruction: 'private instruction',
        scheduledTriggerConfig: {
          cronString: '0 9 * * *',
          timezone: 'Asia/Shanghai',
          defaultPrompt: 'private prompt'
        }
      }
    });
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.app,
      teamId: owner.teamId,
      resourceId: appId,
      tmbId: reader.tmbId,
      permission: ReadPermissionVal
    });

    const res = await Call<Record<string, never>, GetAppDetailQueryType, GetAppDetailResponseType>(
      handler,
      {
        auth: reader,
        headers: {},
        query: { appId }
      }
    );

    expect(res.code).toBe(200);
    expect(res.data.nodes).toEqual([]);
    expect(res.data.edges).toEqual([]);
    expect(res.data.chatConfig).toEqual({});
  });
});
