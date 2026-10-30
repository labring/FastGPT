import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import {
  bundleOpenAPISchema,
  parseOpenAPISchemaString
} from '@fastgpt/global/common/string/swagger';
import { rewriteRuntimeWorkFlow } from '@fastgpt/service/core/workflow/dispatch/utils';

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

const createMcpToolSetNode = (toolList: unknown[]): RuntimeNodeItemType =>
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
        headerSecret: { Authorization: { value: '', secret: 'encrypted-token' } },
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
        headerSecret: { Authorization: { value: '', secret: 'encrypted-token' } },
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
      const nodes = [
        createMcpToolSetNode([
          { name: 'search', description: 'Local search' },
          { name: 'removed', description: 'Stale summary' }
        ])
      ];
      const edges = [createSelectedToolEdge()];
      await rewriteRuntimeWorkFlow({ teamId: 'team-1', tmbId: 'member-1', nodes, edges });
      return { nodes, edges };
    };

    const { nodes, edges } = await run();
    await run();

    expect(mocks.getMcpTools).toHaveBeenCalledTimes(2);
    expect(mocks.getMcpTools).toHaveBeenCalledWith({
      url: 'https://mcp.example.com',
      headers: { Authorization: 'Bearer mcp-token' }
    });
    expect(mocks.getSecretValue).toHaveBeenCalledWith({
      storeSecret: { Authorization: { value: '', secret: 'encrypted-token' } }
    });
    expect(nodes.map((node) => node.name)).toEqual(['Local MCP/search', 'Local MCP/new_tool']);
    expect(nodes.map((node) => node.intro)).toEqual(['Local search', 'Remote new tool']);
    expect(nodes[0].jsonSchema).toEqual(inputSchema);
    expect(nodes[0].toolConfig?.mcpTool).toMatchObject({
      url: 'https://mcp.example.com',
      headerSecret: { Authorization: { value: '', secret: 'encrypted-token' } }
    });
    expect(edges.map((edge) => edge.target)).toEqual(nodes.map((node) => node.nodeId));
  });

  it('propagates MCP list failures without falling back to saved summaries', async () => {
    mocks.getMcpTools.mockRejectedValue(new Error('MCP unavailable'));
    const nodes = [createMcpToolSetNode([{ name: 'search', description: 'Saved tool' }])];

    await expect(
      rewriteRuntimeWorkFlow({ teamId: 'team-1', tmbId: 'member-1', nodes, edges: [] })
    ).rejects.toThrow('MCP unavailable');
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
      headerSecret: { Authorization: { value: '', secret: 'encrypted-token' } }
    });
    expect(nodes[0].toolConfig?.httpTool?.apiSchemaStr).toBe(
      JSON.stringify(await bundleOpenAPISchema(parseOpenAPISchemaString(openApiSchema)))
    );
    expect(edges.map((edge) => edge.target)).toEqual(nodes.map((node) => node.nodeId));
  });

  it('keeps the selected tool when remote tool order changes between resume attempts', async () => {
    const inputSchema = { type: 'object' };
    const search = { name: 'search', description: 'Search', inputSchema };
    const remove = { name: 'delete', description: 'Delete', inputSchema };

    mocks.getMcpTools.mockResolvedValueOnce([search, remove]);
    const firstNodes = [createMcpToolSetNode([])];
    const firstEdges = [createSelectedToolEdge()];
    await rewriteRuntimeWorkFlow({
      teamId: 'team-1',
      tmbId: 'member-1',
      nodes: firstNodes,
      edges: firstEdges
    });
    const selectedTarget = firstNodes.find((node) => node.name.endsWith('/search'))!.nodeId;

    mocks.getMcpTools.mockResolvedValueOnce([remove, search]);
    const resumedNodes = [createMcpToolSetNode([])];
    const resumedEdges = [
      {
        source: 'tool-call',
        sourceHandle: 'selectedTools',
        target: selectedTarget,
        targetHandle: NodeOutputKeyEnum.selectedTools
      }
    ];
    await rewriteRuntimeWorkFlow({
      teamId: 'team-1',
      tmbId: 'member-1',
      nodes: resumedNodes,
      edges: resumedEdges
    });

    expect(
      resumedNodes.find((node) => node.nodeId === resumedEdges[0].target)?.toolConfig?.mcpTool
    ).toMatchObject({ name: 'search' });
  });

  it('maps legacy index child IDs to the current tool position', async () => {
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
    expect(edges[0].target).toBe(nodes[0].nodeId);
  });

  it('rewrites every legacy toolset runtime reference to the stable node', async () => {
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
    const interactive = {
      type: 'userSelect',
      entryNodeIds: ['tool-call'],
      memoryEdges: edges,
      nodeOutputs: [{ nodeId: 'mcp-set0', key: 'rawResponse', value: 'ok' }],
      params: { description: '', userSelectOptions: [] }
    } as any;

    const rewrittenInteractive = await rewriteRuntimeWorkFlow({
      teamId: 'team-1',
      tmbId: 'member-1',
      nodes,
      edges,
      lastInteractive: interactive
    });

    expect(rewrittenInteractive?.entryNodeIds).toEqual(['tool-call']);
    expect(rewrittenInteractive?.memoryEdges?.[0].target).toBe(nodes[0].nodeId);
    expect(rewrittenInteractive?.nodeOutputs?.[0].nodeId).toBe(nodes[0].nodeId);
  });

  it('does not collide with another toolset whose ID starts with the same prefix', async () => {
    mocks.getMcpTools.mockResolvedValue([
      { name: 'search', description: 'Search', inputSchema: { type: 'object' } }
    ]);
    const first = { ...createMcpToolSetNode([]), nodeId: 'a' };
    const second = { ...createMcpToolSetNode([]), nodeId: 'a0' };
    const nodes = [first, second];

    await rewriteRuntimeWorkFlow({ teamId: 'team-1', tmbId: 'member-1', nodes, edges: [] });

    expect(new Set(nodes.map((node) => node.nodeId)).size).toBe(nodes.length);
    expect(nodes.every((node) => node.flowNodeType === FlowNodeTypeEnum.tool)).toBe(true);
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
