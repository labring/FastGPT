import appDetailHandler from '@/pages/api/core/app/detail';
import { onCreateApp } from '@/pages/api/core/app/create';
import type {
  GetAppDetailQueryType,
  GetAppDetailResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

const plaintextHeader = (value: string) => ({ Authorization: { value, secret: '' } });

describe('ToolSet app read responses', () => {
  it('does not return node-local HTTP plaintext credentials', async () => {
    const [root] = (await getFakeUsers(1)).members;
    const appId = await onCreateApp({
      name: 'read response',
      type: 'httpToolSet',
      intro: '',
      teamId: root.teamId,
      tmbId: root.tmbId,
      nodes: [
        {
          nodeId: 'source-tool-set',
          flowNodeType: 'toolSet',
          name: 'Source tool set',
          inputs: [],
          outputs: [],
          toolConfig: {
            httpToolSet: {
              baseUrl: 'https://api.example.com',
              headerSecret: plaintextHeader('parent-plaintext'),
              toolList: [
                {
                  name: 'search',
                  description: 'HTTP search',
                  path: '/search',
                  method: 'GET',
                  headerSecret: plaintextHeader('child-plaintext')
                }
              ]
            }
          }
        }
      ],
      edges: [],
      chatConfig: {},
      storageNodes: []
    });
    const response = await Call<
      Record<string, never>,
      GetAppDetailQueryType,
      GetAppDetailResponseType
    >(appDetailHandler, { auth: root, headers: {}, query: { appId: String(appId) } });

    expect(response.code, JSON.stringify(response)).toBe(200);
    expect(JSON.stringify(response.data)).not.toContain('plaintext');
  });
});
