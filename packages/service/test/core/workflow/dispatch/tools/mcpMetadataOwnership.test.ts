import { describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { McpToolConfigSchema } from '@fastgpt/global/core/app/tool/mcpTool/type';
import { getMCPToolSetRuntimeNode } from '@fastgpt/global/core/app/tool/mcpTool/utils';
import { PublishAppBodySchema } from '@fastgpt/global/openapi/core/app/version/api';
import { migrateWorkflowToCurrent } from '@fastgpt/global/core/workflow/migration';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { encodeMcpToolSetNodesForStorage } from '@fastgpt/service/core/app/jsonSchemaStorage';
import {
  getAppDraftWorkflow,
  getAppPublishedWorkflowMap,
  getAppVersionById
} from '@fastgpt/service/core/app/version/controller';
import { runWithContext } from '@fastgpt/service/core/workflow/utils/context';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), call: vi.fn() }));
vi.mock('@fastgpt/service/support/permission/app/auth', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/support/permission/app/auth')>()),
  authAppByTmbId: mocks.auth
}));
vi.mock('@fastgpt/service/core/app/mcp', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/core/app/mcp')>()),
  assertMCPUrlNotInternal: vi.fn(),
  MCPClient: vi.fn(function () {
    return { toolCall: mocks.call };
  })
}));

import { dispatchRunTool } from '@fastgpt/service/core/workflow/dispatch/child/runTool';
import { dispatchTool } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/tool';

describe('MCP metadata ownership across stored versions and dispatch', () => {
  it.each(['workflow', 'agent'] as const)(
    'loads current tool metadata for %s without republishing the caller',
    async (mode) => {
      const toolAppId = new Types.ObjectId();
      const callerAppId = new Types.ObjectId();
      const firstMeta = { revision: 1 };
      const toolNodes = (requestMeta?: Record<string, unknown>) =>
        encodeMcpToolSetNodesForStorage([
          getMCPToolSetRuntimeNode({
            url: 'https://mcp.example.com',
            toolList: [
              McpToolConfigSchema.parse({
                name: 'search',
                description: 'Search',
                ...(requestMeta !== undefined ? { requestMeta } : {})
              })
            ]
          })
        ]);
      const toolVersion = await MongoAppVersion.create({
        appId: toolAppId,
        tmbId: 'owner',
        isPublish: true,
        nodes: toolNodes(firstMeta),
        edges: []
      });
      const toolApp = {
        _id: toolAppId,
        type: AppTypeEnum.mcpToolSet,
        publishedVersionId: toolVersion._id,
        name: 'Tools',
        teamId: 'team',
        tmbId: 'owner'
      } as any;
      mocks.auth.mockResolvedValue({ app: toolApp });
      mocks.call.mockReset().mockResolvedValue({ content: [] });
      const reference = {
        mcpTool: { toolId: `mcp-${toolAppId}/search` },
        mcpToolSet: {
          url: 'https://old.example.com',
          toolList: [{ name: 'search', description: 'Old' }]
        }
      };
      const published = PublishAppBodySchema.parse({
        nodes: [
          {
            nodeId: 'caller-tool',
            name: 'Tool',
            flowNodeType: FlowNodeTypeEnum.tool,
            toolConfig: reference,
            inputs: [],
            outputs: []
          }
        ]
      });
      const callerWorkflow = migrateWorkflowToCurrent({ nodes: published.nodes! });
      const callerVersion = await MongoAppVersion.create({
        appId: callerAppId,
        tmbId: 'owner',
        isPublish: true,
        ...callerWorkflow
      });
      const callerBefore = await MongoAppVersion.findById(callerVersion._id).lean();
      expect(callerBefore?.nodes[0].toolConfig?.mcpToolSet?.toolList?.[0]).not.toHaveProperty(
        'requestMeta'
      );
      const common = {
        runningAppInfo: {
          sourceType: ChatSourceTypeEnum.app,
          sourceId: String(callerAppId),
          teamId: 'team',
          tmbId: 'owner',
          name: 'Caller'
        },
        runningUserInfo: { teamId: 'team', tmbId: 'member' },
        variableState: { get: () => undefined, toRuntimeRecord: () => ({}) },
        params: { query: 'hello' },
        runtimeNodesMap: new Map(),
        chatId: 'chat',
        uid: 'user',
        responseChatItemId: 'response',
        usagePush: vi.fn()
      };
      await runWithContext({ mcpClientMemory: {} }, async () => {
        for (const [index, requestMeta] of [firstMeta, { revision: 2 }, undefined].entries()) {
          if (index)
            await MongoAppVersion.updateOne(
              { _id: toolVersion._id },
              { $set: { nodes: toolNodes(requestMeta) } }
            );
          if (mode === 'workflow') {
            const result = await dispatchRunTool({
              ...common,
              node: callerWorkflow.nodes[0]
            } as any);
            expect(result.error).toBeUndefined();
          } else {
            const result = await dispatchTool({
              ...common,
              tool: { name: 'Search', avatar: '', toolConfig: callerWorkflow.nodes[0].toolConfig }
            } as any);
            expect(result.errorMessage).toBeUndefined();
          }
          expect(mocks.call.mock.lastCall?.[0]).toEqual({
            toolName: 'search',
            params: { query: 'hello' },
            ...(mode === 'workflow' ? { closeConnection: false } : {}),
            ...(requestMeta ? { requestMeta } : {})
          });
        }
      });
      expect(await MongoAppVersion.findById(callerVersion._id).lean()).toEqual(callerBefore);

      // The tool-owned draft, explicit version and batch published read paths retain its current configuration.
      await MongoAppVersion.updateOne(
        { _id: toolVersion._id },
        { $set: { nodes: toolNodes(firstMeta) } }
      );
      const draft = await getAppDraftWorkflow(String(toolAppId), toolApp);
      const explicit = await getAppVersionById({
        appId: String(toolAppId),
        versionId: String(toolVersion._id),
        app: toolApp
      });
      const publishedMap = await getAppPublishedWorkflowMap([toolApp]);
      for (const workflow of [draft, explicit, publishedMap.get(String(toolAppId))!]) {
        expect(workflow.nodes[0].toolConfig?.mcpToolSet?.toolList?.[0]).toHaveProperty(
          'requestMeta',
          firstMeta
        );
      }
    }
  );
});
