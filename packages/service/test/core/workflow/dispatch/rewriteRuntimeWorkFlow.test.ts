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

describe('rewriteRuntimeWorkFlow node-local toolsets', () => {
  it('expands inline HTTP tools and preserves request config without child credentials', async () => {
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
    const nodes = [createMcpToolSetNode([])];
    const edges = [createSelectedToolEdge()];

    await rewriteRuntimeWorkFlow({ teamId: 'team-1', tmbId: 'member-1', nodes, edges });

    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
  });
});
