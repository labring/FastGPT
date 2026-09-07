import { describe, expect, it, vi } from 'vitest';
import { getUser } from '@test/datas/users';
import { Call as callAPI } from '@test/utils/request';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  FlowNodeTypeEnum,
  FlowNodeInputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { storeSecretValue } from '@fastgpt/service/common/secret/utils';
import { storeNodes2RuntimeNodes } from '@fastgpt/global/core/workflow/runtime/utils';
import { rewriteRuntimeWorkFlow } from '@fastgpt/service/core/workflow/dispatch/utils';
import { dispatchRunTool } from '@fastgpt/service/core/workflow/dispatch/child/runTool';
import { dispatchTool } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/tool';
import preview from '@/pages/api/core/app/tool/getPreviewNode';
import createApp from '@/pages/api/core/app/create';

const mocks = vi.hoisted(() => ({ clientOptions: vi.fn(), call: vi.fn() }));
vi.mock('@fastgpt/service/core/app/mcp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/app/mcp')>()),
  MCPClient: vi.fn(function (options) {
    mocks.clientOptions(options);
    return { toolCall: mocks.call };
  })
}));
vi.mock('@fastgpt/service/core/workflow/utils/context', () => ({
  getWorkflowContext: () => ({ mcpClientMemory: {} })
}));
const Call: typeof callAPI = (handler, props) => callAPI(handler, { headers: {}, ...props });

describe('legacy MCP resource compatibility without migration', () => {
  it.each(['children-map', 'children-single', 'inline-empty-id'] as const)(
    'adds, stores and executes %s resources without changing historical records',
    async (generation) => {
      vi.clearAllMocks();
      mocks.call.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      const auth = await getUser(`legacy-mcp-${generation}`);
      const url = 'https://203.0.113.10/mcp';
      const headers = storeSecretValue({
        Authorization: { value: 'legacy-token' },
        'X-Key': { value: 'api-key' }
      });
      const childHeaders = generation === 'children-single' ? headers.Authorization : headers;
      const tool = {
        name: 'search',
        description: 'Search',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string', description: 'Query', pattern: '^allowed$' } },
          required: ['query']
        }
      };
      const sourceNode = {
        nodeId: 'legacy-set',
        name: 'Legacy MCP',
        flowNodeType: FlowNodeTypeEnum.toolSet,
        outputs: [],
        inputs:
          generation === 'inline-empty-id'
            ? []
            : [
                {
                  key: NodeInputKeyEnum.toolSetData,
                  label: 'Tool Set Data',
                  renderTypeList: [FlowNodeInputTypeEnum.hidden],
                  value: { url, headerSecret: headers, toolList: [tool] }
                }
              ],
        ...(generation === 'inline-empty-id'
          ? {
              toolConfig: {
                mcpToolSet: { toolId: '', url, headerSecret: headers, toolList: [tool] }
              }
            }
          : {})
      };
      const parent = await MongoApp.create({
        name: 'Legacy MCP',
        avatar: 'mcp.svg',
        teamId: auth.teamId,
        tmbId: auth.tmbId,
        type: AppTypeEnum.mcpToolSet,
        modules: [sourceNode],
        edges: [],
        version: 'v2'
      });
      const sourceIds = [parent._id];
      if (generation !== 'inline-empty-id') {
        const child = await MongoApp.create({
          name: 'search',
          avatar: 'mcp.svg',
          teamId: auth.teamId,
          tmbId: auth.tmbId,
          parentId: parent._id,
          type: AppTypeEnum.tool,
          version: 'v2',
          modules: [
            {
              nodeId: 'legacy-child',
              name: 'Search',
              flowNodeType: FlowNodeTypeEnum.tool,
              outputs: [],
              inputs: [
                {
                  key: NodeInputKeyEnum.toolData,
                  label: 'Tool Data',
                  renderTypeList: [FlowNodeInputTypeEnum.hidden],
                  value: { ...tool, url, headerSecret: childHeaders }
                }
              ]
            }
          ]
        });
        sourceIds.push(child._id);
      }
      const sourceQuery = { _id: { $in: sourceIds } };
      const sourceBefore = await MongoApp.find(sourceQuery).sort({ _id: 1 }).lean();
      const sourceId = String(parent._id);
      const toolsetPreview = await Call(preview, {
        auth,
        query: { appId: sourceId, versionId: '' }
      });
      const childPreview = await Call(preview, {
        auth,
        query: { appId: `mcp-${sourceId}/search`, versionId: '' }
      });
      expect(toolsetPreview.error).toBeUndefined();
      expect(childPreview.error).toBeUndefined();
      expect(toolsetPreview.data.inputs).toEqual([]);
      expect(toolsetPreview.data.toolConfig.mcpToolSet.toolId).toBe(sourceId);
      expect(childPreview.data.inputs.map((input: any) => input.key)).toEqual(['query']);
      for (const node of [toolsetPreview.data, childPreview.data]) {
        expect(JSON.stringify(node)).not.toContain('inputSchema');
        expect(JSON.stringify(node)).not.toContain('customJsonSchema');
        expect(JSON.stringify(node)).not.toContain('headerSecret');
      }
      const created = await Call(createApp, {
        auth,
        body: {
          name: 'Workflow',
          type: AppTypeEnum.workflow,
          modules: [
            { ...toolsetPreview.data, nodeId: 'set-node' },
            { ...childPreview.data, nodeId: 'single-node' }
          ],
          edges: []
        }
      });
      expect(created.error).toBeUndefined();
      const stored = await MongoApp.findById(String(created.data)).lean();
      expect(JSON.stringify(stored!.modules)).not.toContain('inputSchema');
      const nodes = storeNodes2RuntimeNodes(stored!.modules, ['set-node', 'single-node']);
      await rewriteRuntimeWorkFlow({ teamId: auth.teamId, tmbId: auth.tmbId, nodes, edges: [] });
      expect(nodes).toHaveLength(2);
      nodes.forEach((node) =>
        expect(node.jsonSchema?.properties?.query?.pattern).toBe('^allowed$')
      );
      if (generation === 'inline-empty-id') {
        const legacyRuntimeNodes = storeNodes2RuntimeNodes(
          [{ ...sourceNode, pluginId: sourceId }],
          ['legacy-set']
        );
        await rewriteRuntimeWorkFlow({
          teamId: auth.teamId,
          tmbId: auth.tmbId,
          nodes: legacyRuntimeNodes,
          edges: []
        });
        expect(legacyRuntimeNodes).toHaveLength(1);
        expect(legacyRuntimeNodes[0].toolConfig?.mcpTool?.toolId).toBe(`mcp-${sourceId}/search`);
        expect(legacyRuntimeNodes[0].jsonSchema?.properties?.query?.pattern).toBe('^allowed$');
      }
      const runningAppInfo = { teamId: auth.teamId, tmbId: auth.tmbId, name: 'Workflow' };
      const runningUserInfo = { teamId: auth.teamId, tmbId: auth.tmbId };
      const result = await dispatchRunTool({
        node: nodes[0],
        params: { query: 'allowed' },
        runningAppInfo,
        runningUserInfo,
        variableState: new Map(),
        uid: auth.tmbId,
        chatId: 'debug',
        responseChatItemId: 'reply',
        usagePush: vi.fn()
      } as any);
      expect(result.error).toBeUndefined();
      const agentResult = await dispatchTool({
        tool: { name: 'Search', avatar: '', toolConfig: nodes[0].toolConfig },
        params: { query: 'allowed' },
        runningAppInfo,
        runningUserInfo,
        variableState: new Map(),
        uid: auth.tmbId,
        chatId: 'debug'
      } as any);
      expect(agentResult.errorMessage).toBeUndefined();
      const expectedHeaders =
        generation === 'children-single'
          ? { Authorization: 'legacy-token' }
          : { Authorization: 'legacy-token', 'X-Key': 'api-key' };
      expect(mocks.clientOptions).toHaveBeenCalledTimes(2);
      mocks.clientOptions.mock.calls.forEach(([options]) =>
        expect(options).toEqual({ url, headers: expectedHeaders })
      );
      expect(mocks.call).toHaveBeenCalledTimes(2);
      expect(await MongoApp.find(sourceQuery).sort({ _id: 1 }).lean()).toEqual(sourceBefore);
    },
    30000
  );
});
