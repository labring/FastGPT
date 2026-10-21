import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { rewriteRuntimeWorkFlow } from '@fastgpt/service/core/workflow/dispatch/utils';

const mocks = vi.hoisted(() => ({
  loadWorkflowAppResource: vi.fn()
}));

vi.mock('@fastgpt/service/core/workflow/resource/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/workflow/resource/service')>()),
  loadWorkflowAppResource: mocks.loadWorkflowAppResource
}));

beforeEach(() => {
  mocks.loadWorkflowAppResource.mockReset();
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

const createHttpToolSetNode = (toolList: unknown[]): RuntimeNodeItemType =>
  ({
    nodeId: 'http-set',
    flowNodeType: FlowNodeTypeEnum.toolSet,
    name: 'Local HTTP',
    avatar: 'http-avatar',
    inputs: [],
    outputs: [],
    toolConfig: {
      httpToolSet: {
        baseUrl: 'https://api.example.com',
        apiSchemaStr: '{"openapi":"3.0.0"}',
        customHeaders: '{"X-Trace":"enabled"}',
        headerSecret: { Authorization: { value: '', secret: 'encrypted-token' } },
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

describe('rewriteRuntimeWorkFlow node-local MCP toolsets', () => {
  it('expands configured tools into inline children and rewires selectedTools', async () => {
    const nodes = [
      createMcpToolSetNode([
        {
          name: 'search',
          description: 'Search documents',
          inputSchema: { type: 'object', properties: { query: { type: 'string' } } }
        }
      ])
    ];
    const edges = [createSelectedToolEdge()];

    await rewriteRuntimeWorkFlow({ teamId: 'team-1', tmbId: 'member-1', nodes, edges });

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      nodeId: 'mcp-set0',
      flowNodeType: FlowNodeTypeEnum.tool,
      toolConfig: {
        mcpTool: {
          name: 'search',
          description: 'Search documents',
          url: 'https://mcp.example.com',
          headerSecret: { Authorization: { value: '', secret: 'encrypted-token' } }
        }
      }
    });
    expect(nodes[0].toolConfig?.mcpTool).not.toHaveProperty('toolId');
    expect(edges).toEqual([
      {
        ...createSelectedToolEdge(),
        target: 'mcp-set0'
      }
    ]);
  });

  it('skips empty local toolsets without leaving parent nodes or edges', async () => {
    const nodes = [createMcpToolSetNode([])];
    const edges = [createSelectedToolEdge()];

    await rewriteRuntimeWorkFlow({ teamId: 'team-1', tmbId: 'member-1', nodes, edges });

    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
  });
});

describe('rewriteRuntimeWorkFlow external MCP toolsets', () => {
  it('uses nested MCP resource ID when it differs from parent plugin ID', async () => {
    mocks.loadWorkflowAppResource.mockResolvedValue(undefined);
    const nodes = [
      {
        nodeId: 'external-mcp-set',
        flowNodeType: FlowNodeTypeEnum.toolSet,
        pluginId: 'parent-toolset-id',
        name: 'External MCP',
        inputs: [],
        outputs: [],
        toolConfig: {
          mcpToolSet: {
            toolId: 'nested-toolset-id',
            toolList: []
          }
        }
      } as RuntimeNodeItemType
    ];

    await rewriteRuntimeWorkFlow({ teamId: 'team-1', tmbId: 'member-1', nodes, edges: [] });

    expect(mocks.loadWorkflowAppResource).toHaveBeenCalledWith({
      appId: 'nested-toolset-id',
      tmbId: 'member-1',
      type: 'tool'
    });
  });
});

describe('rewriteRuntimeWorkFlow external HTTP toolsets', () => {
  it('uses nested toolset id before parent plugin id', async () => {
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

    expect(mocks.loadWorkflowAppResource).toHaveBeenCalledExactlyOnceWith({
      appId: 'nested-http-toolset-id',
      tmbId: 'member-1',
      type: 'tool'
    });
  });
});

describe('rewriteRuntimeWorkFlow node-local HTTP toolsets', () => {
  it('expands imported operations into inline children and preserves the full request config', async () => {
    const tool = {
      name: 'search',
      description: 'Search documents',
      path: '/search',
      method: 'get',
      headerSecret: { Authorization: { value: 'child-secret', secret: '' } },
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', isToolParam: true } },
        required: ['query']
      },
      requestSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query']
      },
      outputSchema: { type: 'object', properties: { result: { type: 'string' } } }
    };
    const nodes = [createHttpToolSetNode([tool])];
    const edges = [createHttpSelectedToolEdge()];

    await rewriteRuntimeWorkFlow({ teamId: 'team-1', tmbId: 'member-1', nodes, edges });

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      nodeId: 'http-set0',
      flowNodeType: FlowNodeTypeEnum.tool,
      toolConfig: {
        httpTool: {
          ...tool,
          baseUrl: 'https://api.example.com',
          apiSchemaStr: '{"openapi":"3.0.0"}',
          customHeaders: '{"X-Trace":"enabled"}',
          headerSecret: { Authorization: { value: '', secret: 'encrypted-token' } }
        }
      }
    });
    expect(nodes[0].toolConfig?.httpTool).not.toHaveProperty('toolId');
    expect(JSON.stringify(nodes[0].toolConfig?.httpTool)).not.toContain('child-secret');
    expect(
      'headerSecret' in (nodes[0].toolConfig?.httpTool ?? {}) &&
        nodes[0].toolConfig?.httpTool?.headerSecret
    ).toEqual({ Authorization: { value: '', secret: 'encrypted-token' } });
    expect(nodes[0].jsonSchema).toEqual(tool.requestSchema);
    expect(edges).toEqual([
      {
        ...createHttpSelectedToolEdge(),
        target: 'http-set0'
      }
    ]);
  });

  it('skips empty local toolsets without leaving parent nodes or edges', async () => {
    const nodes = [createHttpToolSetNode([])];
    const edges = [createHttpSelectedToolEdge()];

    await rewriteRuntimeWorkFlow({ teamId: 'team-1', tmbId: 'member-1', nodes, edges });

    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
  });
});
