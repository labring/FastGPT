import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { SecretValueReferenceResolver } from '@fastgpt/global/common/secret/utils';
import {
  bundleOpenAPISchema,
  parseOpenAPISchemaString
} from '@fastgpt/global/common/string/swagger';
import {
  filterOrphanEdges,
  rewriteRuntimeWorkFlow,
  getInlineMcpToolSetRuntimeNodes
} from '@fastgpt/service/core/workflow/dispatch/utils';
import { getInlineToolSetChildNodeId } from '@fastgpt/global/core/app/tool/utils';
import { storeEdges2RuntimeEdges } from '@fastgpt/global/core/workflow/runtime/utils';

const mocks = vi.hoisted(() => ({
  loadWorkflowAppResource: vi.fn(),
  getMcpTools: vi.fn(),
  getHttpSchema: vi.fn(),
  checkUrlSafety: vi.fn(),
  getSecretValue: vi.fn()
}));

vi.mock('@fastgpt/service/core/workflow/resource/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/workflow/resource/service')>()),
  loadWorkflowAppResource: mocks.loadWorkflowAppResource
}));

vi.mock('@fastgpt/service/core/app/mcp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/app/mcp')>()),
  MCPClient: vi.fn().mockImplementation(function (config: {
    url: string;
    headers: Record<string, any>;
  }) {
    return { getTools: () => mocks.getMcpTools(config) };
  })
}));

vi.mock('@fastgpt/service/common/api/axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/common/api/axios')>();
  actual.axios.get = mocks.getHttpSchema;
  return actual;
});

vi.mock('@fastgpt/service/common/secret/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/secret/utils')>()),
  getSecretValue: mocks.getSecretValue
}));

vi.mock('@fastgpt/service/common/system/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/system/utils')>()),
  checkUrlSafety: mocks.checkUrlSafety
}));

beforeEach(() => {
  mocks.loadWorkflowAppResource.mockReset();
  mocks.getMcpTools.mockReset();
  mocks.getHttpSchema.mockReset();
  mocks.checkUrlSafety.mockReset().mockResolvedValue(undefined);
  mocks.getSecretValue.mockReset().mockReturnValue({ Authorization: 'Bearer mcp-token' });
});

const createMcpToolSetNode = (
  toolList: unknown[],
  headerSecret: unknown = { Authorization: { secret: 'encrypted-token' } }
): RuntimeNodeItemType =>
  ({
    nodeId: 'mcp-set',
    flowNodeType: FlowNodeTypeEnum.toolSet,
    name: 'Local MCP',
    avatar: 'mcp-avatar',
    inputs: [],
    outputs: [],
    toolConfig: {
      mcpToolSet: {
        url: 'https://mcp.example.com',
        headerSecret,
        toolList
      }
    }
  }) as RuntimeNodeItemType;

const createSelectedToolEdge = () => ({
  source: 'tool-call',
  sourceHandle: 'selectedTools',
  target: 'mcp-set',
  targetHandle: NodeOutputKeyEnum.selectedTools
});

const createHttpToolSetNode = (
  toolList: unknown[],
  config: Record<string, unknown> = {}
): RuntimeNodeItemType =>
  ({
    nodeId: 'http-set',
    flowNodeType: FlowNodeTypeEnum.toolSet,
    name: 'Local HTTP',
    avatar: 'http-avatar',
    inputs: [],
    outputs: [],
    toolConfig: {
      httpToolSet: {
        apiSchemaUrl: 'https://api.example.com/openapi.json',
        headerSecret: { Authorization: { secret: 'encrypted-token' } },
        ...config,
        toolList
      }
    }
  }) as RuntimeNodeItemType;

const createHttpSelectedToolEdge = () => ({
  source: 'tool-call',
  sourceHandle: 'selectedTools',
  target: 'http-set',
  targetHandle: NodeOutputKeyEnum.selectedTools
});

const openApiSchema = JSON.stringify(
  {
    openapi: '3.0.0',
    info: { title: 'Test API', version: '1.0.0' },
    servers: [{ url: 'https://api.example.com' }],
    components: {
      schemas: {
        SearchQuery: { type: 'string', description: 'Query parameter' }
      }
    },
    paths: {
      '/search': {
        get: {
          operationId: 'search',
          description: 'Remote search description',
          parameters: [
            {
              name: 'query',
              in: 'query',
              required: true,
              schema: { $ref: '#/components/schemas/SearchQuery' }
            }
          ],
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { result: { type: 'string' } } }
                }
              }
            }
          }
        }
      },
      '/new': {
        post: {
          operationId: 'new_tool',
          summary: 'Remote new tool',
          requestBody: {
            content: {
              'application/json': {
                schema: { type: 'object', properties: { value: { type: 'string' } } }
              }
            }
          },
          responses: { '200': { description: 'OK' } }
        }
      }
    }
  },
  null,
  2
);

describe('rewriteRuntimeWorkFlow external toolsets', () => {
  it('uses the nested toolset ID before the parent plugin ID', async () => {
    mocks.loadWorkflowAppResource.mockResolvedValue(undefined);
    const nodes = [
      {
        nodeId: 'external-http-set',
        flowNodeType: FlowNodeTypeEnum.toolSet,
        pluginId: 'parent-toolset-id',
        name: 'External HTTP',
        inputs: [],
        outputs: [],
        toolConfig: {
          httpToolSet: {
            toolId: 'nested-http-toolset-id',
            toolList: []
          }
        }
      } as RuntimeNodeItemType
    ];

    await rewriteRuntimeWorkFlow({ teamId: 'team-1', tmbId: 'member-1', nodes, edges: [] });

    expect(mocks.loadWorkflowAppResource).toHaveBeenCalledWith({
      appId: 'nested-http-toolset-id',
      tmbId: 'member-1',
      type: 'tool'
    });
  });
});

describe('rewriteRuntimeWorkFlow independent toolsets', () => {
  it('keeps inline MCP references unresolved during workflow initialization', async () => {
    const toolSetNode = createMcpToolSetNode([], { Authorization: { ref: ['login', 'token'] } });
    const nodes = [toolSetNode];
    const edges = [createSelectedToolEdge()];

    await rewriteRuntimeWorkFlow({ teamId: 'team-1', tmbId: 'member-1', nodes, edges });

    expect(nodes).toEqual([toolSetNode]);
    expect(edges).toEqual([createSelectedToolEdge()]);
    expect(mocks.getSecretValue).not.toHaveBeenCalled();
    expect(mocks.getMcpTools).not.toHaveBeenCalled();
  });

  it('resolves workflow references for inline MCP headers', async () => {
    const reference: [string, string] = ['variables', 'apiToken'];
    const resolveReference = vi.fn().mockReturnValue('mcp-token');
    mocks.getMcpTools.mockResolvedValue([]);
    mocks.getSecretValue.mockImplementation(
      ({
        resolveReference: resolveSecretReference
      }: {
        resolveReference?: SecretValueReferenceResolver;
      }) => ({
        Authorization: `Bearer ${resolveSecretReference?.(reference)}`
      })
    );
    const nodes = [
      createMcpToolSetNode([], {
        Authorization: { ref: reference }
      })
    ];

    await getInlineMcpToolSetRuntimeNodes({ toolSetNode: nodes[0], resolveReference });

    expect(resolveReference).toHaveBeenCalledWith(reference);
    expect(mocks.getMcpTools).toHaveBeenCalledWith({
      url: 'https://mcp.example.com',
      headers: { Authorization: 'Bearer mcp-token' }
    });
    expect(mocks.getSecretValue).toHaveBeenCalledWith({
      storeSecret: { Authorization: { ref: reference } },
      resolveReference
    });
  });

  it('fetches the full MCP list, ignores stale summaries, and overrides descriptions by name', async () => {
    const inputSchema = {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query']
    };
    const remoteTools = [
      { name: 'search', description: 'Remote search', inputSchema },
      { name: 'new_tool', description: 'Remote new tool', inputSchema: { type: 'object' } }
    ];
    mocks.getMcpTools.mockResolvedValue(remoteTools);

    const run = async () => {
      const toolSetNode = createMcpToolSetNode([
        { name: 'search', description: 'Local search' },
        { name: 'removed', description: 'Stale summary' }
      ]);
      return getInlineMcpToolSetRuntimeNodes({ toolSetNode });
    };

    const nodes = await run();
    await run();

    expect(mocks.getMcpTools).toHaveBeenCalledTimes(2);
    expect(mocks.getMcpTools).toHaveBeenCalledWith({
      url: 'https://mcp.example.com',
      headers: { Authorization: 'Bearer mcp-token' }
    });
    expect(mocks.getSecretValue).toHaveBeenCalledWith({
      storeSecret: { Authorization: { secret: 'encrypted-token' } }
    });
    expect(nodes.map((node) => node.name)).toEqual(['Local MCP/search', 'Local MCP/new_tool']);
    expect(nodes.map((node) => node.intro)).toEqual(['Local search', 'Remote new tool']);
    expect(nodes[0].jsonSchema).toEqual(inputSchema);
    expect(nodes[0].toolConfig?.mcpTool).toMatchObject({
      url: 'https://mcp.example.com',
      headerSecret: { Authorization: { secret: 'encrypted-token' } }
    });
  });

  it('propagates MCP list failures without falling back to saved summaries', async () => {
    mocks.getMcpTools.mockRejectedValue(new Error('MCP unavailable'));
    const nodes = [createMcpToolSetNode([{ name: 'search', description: 'Saved tool' }])];

    await expect(getInlineMcpToolSetRuntimeNodes({ toolSetNode: nodes[0] })).rejects.toThrow(
      'MCP unavailable'
    );
  });

  it('fetches the full HTTP list, ignores stale summaries, and overrides descriptions by name', async () => {
    mocks.getHttpSchema.mockResolvedValue({ data: openApiSchema });
    const nodes = [
      createHttpToolSetNode(
        [
          { name: 'search', description: 'Local search' },
          { name: 'removed', description: 'Stale summary' }
        ],
        { customHeaders: '{"X-Trace":"enabled"}' }
      )
    ];
    const edges = [createHttpSelectedToolEdge()];

    await rewriteRuntimeWorkFlow({ teamId: 'team-1', tmbId: 'member-1', nodes, edges });

    expect(mocks.checkUrlSafety).toHaveBeenCalledWith(
      'https://api.example.com/openapi.json',
      'OpenAPI Schema URL'
    );
    expect(mocks.getHttpSchema).toHaveBeenCalledWith(
      'https://api.example.com/openapi.json',
      expect.objectContaining({ responseType: 'text', maxRedirects: 0, timeout: 30000 })
    );
    expect(nodes.map((node) => node.name)).toEqual(['Local HTTP/search', 'Local HTTP/new_tool']);
    expect(nodes.map((node) => node.intro)).toEqual(['Local search', 'Remote new tool']);
    expect(nodes[0].jsonSchema).toMatchObject({
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query']
    });
    expect(nodes[0].toolConfig?.httpTool).toMatchObject({
      path: '/search',
      method: 'get',
      customHeaders: '{"X-Trace":"enabled"}',
      headerSecret: { Authorization: { secret: 'encrypted-token' } }
    });
    expect(nodes[0].toolConfig?.httpTool?.apiSchemaStr).toBe(
      JSON.stringify(await bundleOpenAPISchema(parseOpenAPISchemaString(openApiSchema)))
    );
    expect(edges.map((edge) => edge.target)).toEqual(nodes.map((node) => node.nodeId));
  });

  it('restores the parent connection from legacy child edges without discovering MCP tools', async () => {
    mocks.getMcpTools.mockResolvedValue([
      { name: 'search', description: 'Search', inputSchema: { type: 'object' } }
    ]);
    const nodes = [createMcpToolSetNode([])];
    const edges = [
      {
        source: 'tool-call',
        sourceHandle: 'selectedTools',
        target: 'mcp-set0',
        targetHandle: NodeOutputKeyEnum.selectedTools
      }
    ];

    await rewriteRuntimeWorkFlow({ teamId: 'team-1', tmbId: 'member-1', nodes, edges });

    expect(nodes).toHaveLength(1);
    expect(nodes[0].nodeId).toBe('mcp-set');
    expect(edges[0].target).toBe('mcp-set0');
    expect(edges[1].target).toBe('mcp-set');
    expect(mocks.getMcpTools).not.toHaveBeenCalled();
  });

  it('restores a legacy positional child edge for an inline HTTP toolset', async () => {
    mocks.getHttpSchema.mockResolvedValue({ data: openApiSchema });
    const toolSetNode = createHttpToolSetNode([{ name: 'search', description: '' }]);
    const nodes = [toolSetNode];
    const edges = [
      {
        source: 'tool-call',
        sourceHandle: 'selectedTools',
        target: `${toolSetNode.nodeId}0`,
        targetHandle: NodeOutputKeyEnum.selectedTools
      },
      {
        source: 'tool-call',
        sourceHandle: NodeOutputKeyEnum.selectedTools,
        target: toolSetNode.nodeId,
        targetHandle: NodeOutputKeyEnum.selectedTools
      }
    ];

    await rewriteRuntimeWorkFlow({ teamId: 'team-1', tmbId: 'member-1', nodes, edges });

    const toolPathByNodeId = new Map(
      nodes.map((node) => [
        node.nodeId,
        node.toolConfig?.httpTool && 'path' in node.toolConfig.httpTool
          ? node.toolConfig.httpTool.path
          : undefined
      ])
    );
    expect(edges.every((edge) => nodes.some((node) => node.nodeId === edge.target))).toBe(true);
    expect(edges.some((edge) => edge.target === `${toolSetNode.nodeId}0`)).toBe(false);
    expect(edges.map((edge) => toolPathByNodeId.get(edge.target))).toEqual(['/search', '/new']);
    expect(edges[0]).toMatchObject({
      source: 'tool-call',
      sourceHandle: NodeOutputKeyEnum.selectedTools,
      targetHandle: NodeOutputKeyEnum.selectedTools
    });
  });

  it('remaps a legacy HTTP child edge even when the positional ID is a real node', async () => {
    mocks.getHttpSchema.mockResolvedValue({ data: openApiSchema });
    const toolSetNode = createHttpToolSetNode([{ name: 'search', description: '' }]);
    const realNode = {
      ...toolSetNode,
      nodeId: `${toolSetNode.nodeId}0`,
      flowNodeType: FlowNodeTypeEnum.textEditor,
      toolConfig: undefined
    };
    const nodes = [toolSetNode, realNode];
    const edges = [
      {
        source: 'tool-call',
        sourceHandle: 'selectedTools',
        target: realNode.nodeId,
        targetHandle: NodeOutputKeyEnum.selectedTools
      },
      {
        source: 'tool-call',
        sourceHandle: NodeOutputKeyEnum.selectedTools,
        target: toolSetNode.nodeId,
        targetHandle: NodeOutputKeyEnum.selectedTools
      }
    ];

    await rewriteRuntimeWorkFlow({ teamId: 'team-1', tmbId: 'member-1', nodes, edges });

    const searchNodeIds = new Set(
      nodes
        .filter((node) => {
          const httpTool = node.toolConfig?.httpTool;
          return httpTool && 'path' in httpTool && httpTool.path === '/search';
        })
        .map((node) => node.nodeId)
    );
    expect(nodes.some((node) => node.nodeId === realNode.nodeId)).toBe(true);
    expect(edges[0].target).toBe(realNode.nodeId);
    expect(edges.some((edge) => searchNodeIds.has(edge.target))).toBe(true);
  });

  it('restores hash child edges of an unexpanded inline MCP toolset', async () => {
    const tool = { name: 'search', description: 'Search', inputSchema: { type: 'object' } };
    const toolSetNode = createMcpToolSetNode([{ name: tool.name, description: '' }]);
    const childId = getInlineToolSetChildNodeId({
      toolSetNodeId: toolSetNode.nodeId,
      tool
    });
    const nodes = [toolSetNode];
    const edges = [
      {
        source: 'tool-call',
        sourceHandle: 'selectedTools',
        target: childId,
        targetHandle: NodeOutputKeyEnum.selectedTools
      }
    ];

    await rewriteRuntimeWorkFlow({ teamId: 'team-1', tmbId: 'member-1', nodes, edges });

    expect(nodes).toHaveLength(1);
    expect(edges.map((edge) => edge.target)).toEqual([childId, toolSetNode.nodeId]);
    expect(mocks.getMcpTools).not.toHaveBeenCalled();
  });

  it('keeps the persisted MCP parent edge when the remote catalog differs from the summary', async () => {
    const savedTool = { name: 'saved_tool', description: 'Saved tool' };
    const remoteTool = {
      name: 'remote_tool',
      description: 'Remote tool'
    };
    const toolSetNode = createMcpToolSetNode([savedTool]);
    const toolCallNode = {
      nodeId: 'tool-call',
      flowNodeType: FlowNodeTypeEnum.toolCall,
      name: 'Tool Call',
      inputs: [],
      outputs: []
    } as RuntimeNodeItemType;
    const parentEdge = createSelectedToolEdge();
    const edges = storeEdges2RuntimeEdges([parentEdge], {
      type: 'userSelect',
      entryNodeIds: ['tool-call'],
      memoryEdges: [
        {
          ...parentEdge,
          target: getInlineToolSetChildNodeId({
            toolSetNodeId: toolSetNode.nodeId,
            tool: remoteTool
          }),
          status: 'active'
        }
      ],
      nodeOutputs: [],
      params: { description: '', userSelectOptions: [] }
    });

    const nodes = [toolCallNode, toolSetNode];
    await rewriteRuntimeWorkFlow({ teamId: 'team-1', tmbId: 'member-1', nodes, edges });
    const filteredEdges = filterOrphanEdges({
      nodes,
      edges,
      workflowId: 'workflow-app'
    });

    expect(filteredEdges).toContainEqual(expect.objectContaining(parentEdge));
  });

  it('retains multiple inline MCP toolsets until their ToolCall executes', async () => {
    mocks.getMcpTools.mockResolvedValue([
      { name: 'search', description: 'Search', inputSchema: { type: 'object' } }
    ]);
    const first = { ...createMcpToolSetNode([]), nodeId: 'a' };
    const second = { ...createMcpToolSetNode([]), nodeId: 'a0' };
    const nodes = [first, second];

    await rewriteRuntimeWorkFlow({ teamId: 'team-1', tmbId: 'member-1', nodes, edges: [] });

    expect(nodes).toEqual([first, second]);
    expect(mocks.getMcpTools).not.toHaveBeenCalled();
  });

  it('does not remap an edge that already targets a real node with the legacy child ID', async () => {
    mocks.getMcpTools.mockResolvedValue([
      { name: 'search', description: 'Search', inputSchema: { type: 'object' } }
    ]);
    const toolset = { ...createMcpToolSetNode([]), nodeId: 'a' };
    const realNode = {
      ...createMcpToolSetNode([]),
      nodeId: 'a0',
      flowNodeType: FlowNodeTypeEnum.textEditor,
      toolConfig: undefined
    };
    const edges = [
      {
        source: 'a',
        sourceHandle: 'selectedTools',
        target: 'a0',
        targetHandle: NodeOutputKeyEnum.selectedTools
      }
    ];

    await rewriteRuntimeWorkFlow({
      teamId: 'team-1',
      tmbId: 'member-1',
      nodes: [toolset, realNode],
      edges
    });

    expect(edges[0].target).toBe('a0');
  });

  it('keeps duplicate HTTP tool names distinct by path and method', async () => {
    mocks.getHttpSchema.mockResolvedValue({
      data: JSON.stringify({
        openapi: '3.0.0',
        info: { title: 'Duplicate names', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/search': {
            get: { operationId: 'search', responses: { 200: { description: 'OK' } } }
          },
          '/search-v2': {
            post: { operationId: 'search', responses: { 200: { description: 'OK' } } }
          }
        }
      })
    });
    const nodes = [createHttpToolSetNode([])];

    await rewriteRuntimeWorkFlow({ teamId: 'team-1', tmbId: 'member-1', nodes, edges: [] });

    expect(nodes).toHaveLength(2);
    expect(nodes[0].nodeId).not.toBe(nodes[1].nodeId);
  });

  it('keeps inline MCP child ids stable when remote tools are reordered', async () => {
    const search = { name: 'search', description: 'Search', inputSchema: { type: 'object' } };
    const read = { name: 'read', description: 'Read', inputSchema: { type: 'object' } };
    const toolSetNode = createMcpToolSetNode([]);

    mocks.getMcpTools.mockResolvedValueOnce([search, read]);
    const original = await getInlineMcpToolSetRuntimeNodes({ toolSetNode });
    mocks.getMcpTools.mockResolvedValueOnce([read, search]);
    const reordered = await getInlineMcpToolSetRuntimeNodes({ toolSetNode });

    expect(Object.fromEntries(original.map((node) => [node.name, node.nodeId]))).toEqual(
      Object.fromEntries(reordered.map((node) => [node.name, node.nodeId]))
    );
  });

  it('keeps inline HTTP child ids stable when method keys are reordered', async () => {
    const schema = (methods: ('get' | 'post')[]) =>
      JSON.stringify({
        openapi: '3.0.0',
        info: { title: 'Stable methods', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/items': Object.fromEntries(
            methods.map((method) => [method, { responses: { 200: { description: 'OK' } } }])
          )
        }
      });
    const getIds = async (methods: ('get' | 'post')[]) => {
      mocks.getHttpSchema.mockResolvedValue({ data: schema(methods) });
      const nodes = [createHttpToolSetNode([])];
      await rewriteRuntimeWorkFlow({ teamId: 'team-1', tmbId: 'member-1', nodes, edges: [] });
      return Object.fromEntries(
        nodes.map((node) => {
          const tool = node.toolConfig?.httpTool;
          if (!tool || !('method' in tool) || !('path' in tool))
            throw new Error('Missing HTTP child config');
          return [`${tool.method}:${tool.path}`, node.nodeId];
        })
      );
    };

    expect(await getIds(['get', 'post'])).toEqual(await getIds(['post', 'get']));
  });

  it('uses the OpenAPI server URL when no base URL override is configured', async () => {
    mocks.getHttpSchema.mockResolvedValue({ data: openApiSchema });
    const nodes = [createHttpToolSetNode([{ name: 'search', description: '' }])];

    await rewriteRuntimeWorkFlow({ teamId: 'team-1', tmbId: 'member-1', nodes, edges: [] });

    expect(nodes[0].toolConfig?.httpTool).toMatchObject({ baseUrl: 'https://api.example.com' });
  });

  it('uses the configured base URL instead of the OpenAPI server URL', async () => {
    mocks.getHttpSchema.mockResolvedValue({ data: openApiSchema });
    const baseUrl = 'https://gateway.example.com/v2';
    const nodes = [createHttpToolSetNode([{ name: 'search', description: '' }], { baseUrl })];

    await rewriteRuntimeWorkFlow({ teamId: 'team-1', tmbId: 'member-1', nodes, edges: [] });

    expect(nodes[0].toolConfig?.httpTool).toMatchObject({ baseUrl });
  });

  it('fails when the HTTP schema URL is missing instead of using saved summaries', async () => {
    const nodes = [
      createHttpToolSetNode([{ name: 'search', description: 'Saved tool' }], { apiSchemaUrl: '' })
    ];

    await expect(
      rewriteRuntimeWorkFlow({ teamId: 'team-1', tmbId: 'member-1', nodes, edges: [] })
    ).rejects.toThrow('HTTP tool set schema URL is missing');
    expect(mocks.getHttpSchema).not.toHaveBeenCalled();
  });

  it('propagates HTTP download and parse failures without using saved summaries', async () => {
    const nodes = [createHttpToolSetNode([{ name: 'search', description: 'Saved tool' }])];
    mocks.getHttpSchema.mockRejectedValue(new Error('schema download failed'));

    await expect(
      rewriteRuntimeWorkFlow({ teamId: 'team-1', tmbId: 'member-1', nodes, edges: [] })
    ).rejects.toThrow('schema download failed');

    mocks.getHttpSchema.mockResolvedValue({ data: 'not an OpenAPI schema' });
    await expect(
      rewriteRuntimeWorkFlow({
        teamId: 'team-1',
        tmbId: 'member-1',
        nodes: [createHttpToolSetNode([{ name: 'search', description: 'Saved tool' }])],
        edges: []
      })
    ).rejects.toThrow();
  });
});
