import handler from '@/pages/api/core/app/detail';
import { onCreateApp } from '@/pages/api/core/app/create';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type {
  GetAppDetailQueryType,
  GetAppDetailResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getFakeUsers } from '@test/datas/users';
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
});
