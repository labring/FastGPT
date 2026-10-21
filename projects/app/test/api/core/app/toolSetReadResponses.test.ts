import { onCreateApp } from '@/pages/api/core/app/create';
import appDetailHandler from '@/pages/api/core/app/detail';
import latestVersionHandler from '@/pages/api/core/app/version/latest';
import versionDetailHandler from '@/pages/api/core/app/version/detail';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { AppVersionSchemaType } from '@fastgpt/global/core/app/version/type';
import type {
  GetAppDetailQueryType,
  GetAppDetailResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import type {
  GetAppVersionDetailQueryType,
  GetAppVersionDetailResponseType,
  GetLatestAppVersionQueryType,
  GetLatestAppVersionResponseType
} from '@fastgpt/global/openapi/core/app/version/api';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getClientToolPreviewNodeMock } = vi.hoisted(() => ({
  getClientToolPreviewNodeMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/tool/utils/client', () => ({
  getClientToolPreviewNode: getClientToolPreviewNodeMock
}));

const plaintextHeader = (value: string) => ({ Authorization: { value, secret: '' } });

const createAppWithStoredNodes = async ({
  owner,
  type,
  nodes
}: {
  owner: Awaited<ReturnType<typeof getFakeUsers>>['members'][number];
  type: AppTypeEnum;
  nodes: AppVersionSchemaType['nodes'];
}) => {
  const appId = await onCreateApp({
    name: `read response ${type}`,
    intro: '',
    type,
    teamId: owner.teamId,
    tmbId: owner.tmbId,
    nodes: [],
    storageNodes: [],
    edges: [],
    chatConfig: {}
  });
  const version = await MongoAppVersion.findOne({ appId }).lean();
  if (!version) throw new Error('initial app version was not created');
  await MongoAppVersion.updateOne({ _id: version._id }, { $set: { nodes } });

  return { appId, versionId: String(version._id) };
};

const getAllReadResponses = async ({
  owner,
  appId,
  versionId
}: {
  owner: Awaited<ReturnType<typeof getFakeUsers>>['members'][number];
  appId: string;
  versionId: string;
}) => {
  const [detail, versionDetail, latest] = await Promise.all([
    Call<Record<string, never>, GetAppDetailQueryType, GetAppDetailResponseType>(appDetailHandler, {
      auth: owner,
      headers: {},
      query: { appId }
    }),
    Call<Record<string, never>, GetAppVersionDetailQueryType, GetAppVersionDetailResponseType>(
      versionDetailHandler,
      {
        auth: owner,
        headers: {},
        query: { appId, versionId }
      }
    ),
    Call<Record<string, never>, GetLatestAppVersionQueryType, GetLatestAppVersionResponseType>(
      latestVersionHandler,
      {
        auth: owner,
        headers: {},
        query: { appId }
      }
    )
  ]);

  return [detail, versionDetail, latest];
};

describe('ToolSet app read responses', () => {
  beforeEach(() => {
    getClientToolPreviewNodeMock.mockReset();
  });

  it.each([
    {
      type: AppTypeEnum.httpToolSet,
      configKey: 'httpToolSet',
      config: {
        baseUrl: 'https://api.example.com',
        headerSecret: plaintextHeader('http-parent-plaintext'),
        toolList: [
          {
            name: 'search',
            description: 'HTTP search',
            path: '/search',
            method: 'GET',
            headerSecret: plaintextHeader('http-child-plaintext')
          }
        ]
      }
    },
    {
      type: AppTypeEnum.mcpToolSet,
      configKey: 'mcpToolSet',
      config: {
        url: 'https://mcp.example.com',
        headerSecret: plaintextHeader('mcp-parent-plaintext'),
        toolList: [{ name: 'search', description: 'MCP search' }]
      }
    }
  ])('uses the generic response schema for $type in detail and version reads', async (fixture) => {
    const [owner] = (await getFakeUsers(1)).members;
    const node = {
      nodeId: 'source-tool-set',
      flowNodeType: FlowNodeTypeEnum.toolSet,
      name: 'Source tool set',
      inputs: [],
      outputs: [],
      toolConfig: { [fixture.configKey]: fixture.config }
    } as AppVersionSchemaType['nodes'][number];
    const { appId, versionId } = await createAppWithStoredNodes({
      owner,
      type: fixture.type,
      nodes: [node]
    });

    const responses = await getAllReadResponses({ owner, appId, versionId });
    responses.forEach((response, index) =>
      expect(response.code, `${index}: ${JSON.stringify(response)}`).toBe(200)
    );
    responses.forEach((response) => {
      const returnedConfig = response.data.nodes[0].toolConfig?.[fixture.configKey];
      expect(returnedConfig?.headerSecret?.Authorization).toMatchObject({
        value: '',
        secret: expect.stringMatching(/\S/)
      });
      expect(JSON.stringify(response.data)).not.toContain('parent-plaintext');
      if (fixture.configKey === 'httpToolSet') {
        expect(returnedConfig?.toolList?.[0]).not.toHaveProperty('headerSecret');
        expect(JSON.stringify(response.data)).not.toContain('child-plaintext');
      }
    });
  });

  it('preserves canonical ToolSet references across all reads', async () => {
    const [owner] = (await getFakeUsers(1)).members;
    const mcpPluginId = '507f1f77bcf86cd799439011';
    const mcpToolSetId = '507f1f77bcf86cd799439012';
    const httpPluginId = '507f1f77bcf86cd799439013';
    const httpToolSetId = '507f1f77bcf86cd799439014';
    const nodes = [
      {
        nodeId: 'mcp-reference',
        flowNodeType: FlowNodeTypeEnum.toolSet,
        pluginId: mcpPluginId,
        name: 'MCP ToolSet',
        inputs: [],
        outputs: [],
        toolConfig: {
          mcpToolSet: {
            toolId: mcpToolSetId,
            toolList: [{ name: 'search', description: 'MCP search' }]
          }
        }
      },
      {
        nodeId: 'http-reference',
        flowNodeType: FlowNodeTypeEnum.toolSet,
        pluginId: httpPluginId,
        name: 'HTTP ToolSet',
        inputs: [],
        outputs: [],
        toolConfig: {
          httpToolSet: {
            toolId: httpToolSetId,
            toolList: [{ name: 'search', description: 'HTTP search' }]
          }
        }
      }
    ] as AppVersionSchemaType['nodes'];
    getClientToolPreviewNodeMock.mockRejectedValue(new Error('tool preview failed'));
    const { appId, versionId } = await createAppWithStoredNodes({
      owner,
      type: AppTypeEnum.workflow,
      nodes
    });
    await MongoAppVersion.updateOne(
      { _id: versionId },
      {
        $set: {
          resources: [
            { type: 'tool', id: mcpToolSetId },
            { type: 'tool', id: httpToolSetId }
          ]
        }
      }
    );

    const responses = await getAllReadResponses({ owner, appId, versionId });
    responses.forEach((response, index) =>
      expect(response.code, `${index}: ${JSON.stringify(response)}`).toBe(200)
    );
    responses.forEach((response) => {
      const [mcpReference, httpReference] = response.data.nodes;
      expect(mcpReference.pluginId).toBe(mcpPluginId);
      expect(mcpReference.toolConfig?.mcpToolSet).toEqual({
        toolId: mcpToolSetId,
        toolList: [{ name: 'search', description: 'MCP search' }]
      });
      expect(httpReference.pluginId).toBe(httpPluginId);
      expect(httpReference.toolConfig?.httpToolSet).toEqual({
        toolId: httpToolSetId,
        toolList: [{ name: 'search', description: 'HTTP search' }]
      });
    });
    expect(getClientToolPreviewNodeMock).toHaveBeenCalledTimes(6);
    expect(getClientToolPreviewNodeMock).toHaveBeenCalledWith(
      expect.objectContaining({ appId: mcpToolSetId })
    );
    expect(getClientToolPreviewNodeMock).toHaveBeenCalledWith(
      expect.objectContaining({ appId: httpToolSetId })
    );
  });
});
