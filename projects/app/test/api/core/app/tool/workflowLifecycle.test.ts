import { describe, expect, it } from 'vitest';
import { getUser } from '@test/datas/users';
import { Call as callAPI } from '@test/utils/request';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { storeNodes2RuntimeNodes } from '@fastgpt/global/core/workflow/runtime/utils';
import { rewriteRuntimeWorkFlow } from '@fastgpt/service/core/workflow/dispatch/utils';
import { getAgentRuntimeTools } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/tool/utils';
import { HttpToolTypeEnum } from '@fastgpt/global/core/app/tool/httpTool/constants';
import createApp from '@/pages/api/core/app/create';
import copyApp from '@/pages/api/core/app/copy';
import transitionWorkflow from '@/pages/api/core/app/transitionWorkflow';
import publish from '@/pages/api/core/app/version/publish';
import detail from '@/pages/api/core/app/detail';
import versionDetail from '@/pages/api/core/app/version/detail';
import latest from '@/pages/api/core/app/version/latest';
import preview from '@/pages/api/core/app/tool/getPreviewNode';
import listChildren from '@/pages/api/core/app/tool/getToolSetChildren';
import createHTTP from '@/pages/api/core/app/httpTools/create';
import createMCP from '@/pages/api/core/app/mcpTools/create';
import updateHTTP from '@/pages/api/core/app/httpTools/update';
import updateMCP from '@/pages/api/core/app/mcpTools/update';

const Call: typeof callAPI = (handler, props) => callAPI(handler, { headers: {}, ...props });

describe('MCP/HTTP workflow schema lifecycle', () => {
  it.each([
    ['mcp', 'single'],
    ['http', 'single'],
    ['mcp', 'toolset'],
    ['http', 'toolset'],
    ['mcp', 'agent'],
    ['http', 'agent']
  ] as const)(
    '%s %s stays schema-free across orchestration and reloads the latest definition',
    async (source, shape) => {
      const auth = await getUser(`lifecycle-${source}-${shape}`);
      const toolSetKey = source === 'mcp' ? 'mcpToolSet' : 'httpToolSet';
      const schema = {
        type: 'object',
        properties: { query: { type: 'string', description: 'Query', isToolParam: true } },
        required: ['query']
      };
      const tool = {
        name: 'search',
        description: 'Search',
        path: '/search',
        method: 'POST',
        inputSchema: schema,
        requestSchema: schema,
        outputSchema: { type: 'object', properties: { result: { type: 'string' } } },
        staticHeaders: [{ key: 'X-Private', value: 'private-header' }],
        staticParams: [{ key: 'fixed', value: 'private-param' }]
      };
      const url = 'https://203.0.113.10/mcp';
      const createdSource = await Call(source === 'mcp' ? createMCP : createHTTP, {
        auth,
        body:
          source === 'mcp'
            ? { name: 'MCP', url, toolList: [tool] }
            : { name: 'HTTP', createType: HttpToolTypeEnum.manual }
      });
      expect(createdSource.code, JSON.stringify(createdSource.error)).toBe(200);
      const sourceId = String(createdSource.data);
      const updateSource = async (currentTool: typeof tool) => {
        const result = await Call(source === 'mcp' ? updateMCP : updateHTTP, {
          auth,
          body: {
            appId: sourceId,
            toolList: [currentTool],
            url,
            baseUrl: 'https://203.0.113.10',
            apiSchemaStr: 'private-openapi',
            customHeaders: '{"X-Set":"private-set-header"}'
          }
        });
        expect(result.code, JSON.stringify(result.error)).toBe(200);
      };
      await updateSource(tool);
      const sourceDetail = await Call(detail, { auth, query: { appId: sourceId } });
      expect(sourceDetail.error).toBeUndefined();
      expect(sourceDetail.code).toBe(200);
      const sourceConfig = sourceDetail.data.modules[0].toolConfig;
      expect(sourceConfig[toolSetKey].toolList[0].inputSchema).toEqual(schema);
      if (source === 'http') {
        expect(sourceConfig.httpToolSet).toMatchObject({
          baseUrl: 'https://203.0.113.10',
          apiSchemaStr: 'private-openapi'
        });
        expect(sourceConfig.httpToolSet.toolList[0].staticHeaders).toEqual(tool.staticHeaders);
      }
      const sourceVersion = await MongoAppVersion.findOne({ appId: sourceId }).lean();
      const sourceVersionDetail = await Call(versionDetail, {
        auth,
        query: { appId: sourceId, versionId: String(sourceVersion!._id) }
      });
      expect(sourceVersionDetail.code, JSON.stringify(sourceVersionDetail.error)).toBe(200);
      expect(
        sourceVersionDetail.data.nodes[0].toolConfig[toolSetKey].toolList[0].inputSchema
      ).toEqual(schema);

      const list = await Call(listChildren, { auth, query: { appId: sourceId } });
      expect(list.code).toBe(200);
      expect(Object.keys(list.data.tools[0]).sort()).toEqual([
        'avatar',
        'description',
        'id',
        'name'
      ]);
      const selectedId = shape === 'single' ? `${source}-${sourceId}/search` : sourceId;
      const result = await Call(preview, { auth, query: { appId: selectedId, versionId: '' } });
      expect(result.code, JSON.stringify(result.error)).toBe(200);
      const assertNoExecutionDefinition = (nodes: unknown) => {
        const serialized = JSON.stringify(nodes);
        for (const field of [
          'inputSchema',
          'requestSchema',
          'outputSchema',
          'customJsonSchema',
          'apiSchemaStr',
          'staticHeaders',
          'staticParams',
          'baseUrl'
        ]) {
          expect(serialized).not.toContain(`"${field}"`);
        }
        expect(serialized).not.toContain('private-header');
      };
      assertNoExecutionDefinition(result.data);

      // 模拟旧客户端/导入文件携带完整工具集快照，包含单节点和 Agent 内嵌引用。
      const dirtyNodes =
        shape === 'agent'
          ? [
              {
                nodeId: 'agent',
                name: 'Agent',
                flowNodeType: FlowNodeTypeEnum.agent,
                outputs: [],
                inputs: [
                  {
                    key: NodeInputKeyEnum.selectedTools,
                    label: 'Tools',
                    renderTypeList: [FlowNodeInputTypeEnum.selectTool],
                    value: [
                      {
                        id: sourceId,
                        toolConfig: sourceConfig,
                        config: { query: 'saved-input' },
                        inputs: [{ key: 'query', mode: 'manual' }]
                      }
                    ]
                  }
                ]
              }
            ]
          : [
              {
                ...result.data,
                nodeId: 'tool',
                toolConfig: { ...result.data.toolConfig, ...sourceConfig },
                inputs: result.data.inputs.map((input: Record<string, unknown>) => ({
                  ...input,
                  value: 'saved-input',
                  customJsonSchema: schema.properties.query
                }))
              }
            ];
      const created = await Call(createApp, {
        auth,
        body: { name: 'Workflow', type: AppTypeEnum.workflow, modules: dirtyNodes, edges: [] }
      });
      expect(created.code, JSON.stringify(created.error)).toBe(200);
      const appId = String(created.data);
      const assertStored = async (id: string) => {
        const app = await MongoApp.findById(id).lean();
        assertNoExecutionDefinition(app!.modules);
        expect(JSON.stringify(app!.modules)).not.toContain('"toolList"');
        const versions = await MongoAppVersion.find({ appId: id }).lean();
        versions.forEach((version) => {
          assertNoExecutionDefinition(version.nodes);
          expect(JSON.stringify(version.nodes)).not.toContain('"toolList"');
        });
        return app!;
      };
      await assertStored(appId);

      // 自动保存、新建草稿和发布都直接校验 Mongo 中的 App/Version，不只断言返回值。
      for (const flags of [
        { autoSave: true },
        { autoSave: false, isPublish: false },
        { autoSave: false, isPublish: true }
      ]) {
        const saved = await Call(publish, {
          auth,
          query: { appId },
          body: { nodes: dirtyNodes, edges: [], versionName: 'Version', ...flags }
        });
        expect(saved.code, JSON.stringify(saved.error)).toBe(200);
        await assertStored(appId);
      }
      const currentVersion = await MongoAppVersion.findOne({ appId, isPublish: true })
        .sort({ time: -1 })
        .lean();
      const readWorkflow = async (expectClean = true) => {
        const details = [
          await Call(detail, { auth, query: { appId } }),
          await Call(versionDetail, {
            auth,
            query: { appId, versionId: String(currentVersion!._id) }
          }),
          await Call(latest, { auth, query: { appId } })
        ];
        for (const response of details) {
          expect(response.code, JSON.stringify(response.error)).toBe(200);
          if (expectClean)
            assertNoExecutionDefinition(response.data.modules ?? response.data.nodes);
        }
        return details;
      };
      await readWorkflow();

      // 不为存量快照添加读取清理；只有复制/保存这样的写入动作应用新的存储 Schema。
      // 与真实 HTTP 往返一致：JSON 会省略 undefined，不能把测试进程内部值当成历史线上记录。
      const wireNodes = JSON.parse(JSON.stringify(dirtyNodes));
      await MongoApp.updateOne({ _id: appId }, { modules: wireNodes });
      await MongoAppVersion.updateOne({ _id: currentVersion!._id }, { nodes: wireNodes });
      await readWorkflow(false);
      expect(JSON.stringify((await MongoApp.findById(appId).lean())?.modules)).toContain(
        'inputSchema'
      );
      const copied = await Call(copyApp, { auth, body: { appId } });
      expect(copied.code, JSON.stringify(copied.error)).toBe(200);
      await assertStored(copied.data.appId);
      const transitioned = await Call(transitionWorkflow, {
        auth,
        body: { appId: copied.data.appId, createNew: false }
      });
      expect(transitioned.code, JSON.stringify(transitioned.error)).toBe(200);
      await assertStored(copied.data.appId);
      const transitionCopy = await Call(transitionWorkflow, {
        auth,
        body: { appId: copied.data.appId, createNew: true }
      });
      expect(transitionCopy.code, JSON.stringify(transitionCopy.error)).toBe(200);
      await assertStored(transitionCopy.data.id);

      // 更新工具后无需保存工作流，下一次运行必须读取新的约束。
      const latestSchema = {
        ...schema,
        properties: { query: { ...schema.properties.query, pattern: '^latest$' } }
      };
      await updateSource({ ...tool, inputSchema: latestSchema, requestSchema: latestSchema });
      const stored = await MongoApp.findById(copied.data.appId).lean();
      if (shape === 'agent') {
        const runtime = await getAgentRuntimeTools({
          tools: stored!.modules[0].inputs[0].value,
          tmbId: auth.tmbId
        });
        expect(JSON.stringify(runtime)).toContain('^latest$');
      } else {
        const nodes = storeNodes2RuntimeNodes(stored!.modules, [stored!.modules[0].nodeId]);
        await rewriteRuntimeWorkFlow({ teamId: auth.teamId, tmbId: auth.tmbId, nodes, edges: [] });
        expect(nodes).toHaveLength(1);
        expect(nodes[0].jsonSchema?.properties?.query?.pattern).toBe('^latest$');
      }
      await assertStored(copied.data.appId);
      const sourceAfter = await MongoApp.findById(sourceId).lean();
      expect(
        typeof (sourceAfter!.modules[0].toolConfig![toolSetKey] as any).toolList[0].inputSchema
      ).toBe('string');

      // 工具删除后仍可查看历史记录，不主动清理数据库中的旧快照。
      await MongoApp.deleteOne({ _id: sourceId });
      await readWorkflow(false);
      expect(JSON.stringify((await MongoApp.findById(appId).lean())?.modules)).toContain(
        'inputSchema'
      );
    },
    30000
  );
});
