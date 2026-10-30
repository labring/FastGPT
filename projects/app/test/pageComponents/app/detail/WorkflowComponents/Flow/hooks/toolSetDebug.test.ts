import { describe, expect, it, vi } from 'vitest';
import {
  getMCPToolRuntimeNode,
  getMCPToolSetRuntimeNode
} from '@fastgpt/global/core/app/tool/mcpTool/utils';
import { getHTTPToolSetRuntimeNode } from '@fastgpt/global/core/app/tool/httpTool/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  getToolSetDebugData,
  getToolSetDebugRuntimeNode
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/hooks/toolSetDebug';

const httpDebugMocks = vi.hoisted(() => ({
  getApiSchemaByUrl: vi.fn(),
  str2OpenApiSchema: vi.fn(),
  pathData2ToolList: vi.fn()
}));

vi.mock('@/web/core/app/api/httpTools', () => ({
  getApiSchemaByUrl: httpDebugMocks.getApiSchemaByUrl
}));
vi.mock('@fastgpt/global/core/app/jsonschema', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/global/core/app/jsonschema')>()),
  str2OpenApiSchema: httpDebugMocks.str2OpenApiSchema
}));
vi.mock('@fastgpt/global/core/app/tool/httpTool/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/global/core/app/tool/httpTool/utils')>()),
  pathData2ToolList: httpDebugMocks.pathData2ToolList
}));

describe('toolset node debug', () => {
  it('runs only the selected inline MCP tool under the parent node ID', () => {
    const node = getMCPToolSetRuntimeNode({
      name: 'MCP tools',
      url: 'https://mcp.example.com',
      toolList: [
        { name: 'first', description: '', inputSchema: { type: 'object', properties: {} } },
        {
          name: 'second',
          description: '',
          inputSchema: { type: 'object', properties: { query: { type: 'string' } } }
        }
      ]
    });
    node.nodeId = 'toolset';
    node.toolConfig = {
      mcpToolSet: {
        url: 'https://mcp.example.com',
        toolList: [
          { name: 'first', description: '' },
          { name: 'second', description: '' }
        ]
      }
    };

    const result = getToolSetDebugRuntimeNode({
      toolSetNode: node,
      toolIndex: 1,
      debugData: {
        type: 'mcp',
        toolList: [
          { name: 'first', description: '', inputSchema: { type: 'object', properties: {} } },
          {
            name: 'second',
            description: '',
            inputSchema: { type: 'object', properties: { query: { type: 'string' } } }
          }
        ]
      }
    });

    expect(result).toMatchObject({
      nodeId: 'toolset',
      flowNodeType: FlowNodeTypeEnum.tool,
      name: 'MCP tools/second',
      toolConfig: { mcpTool: { name: 'second', url: 'https://mcp.example.com' } }
    });
    expect(result?.inputs.map((input) => input.key)).toEqual(['query']);
  });

  it('uses a referenced child preview and rejects an out-of-range tool', () => {
    const preview = getMCPToolRuntimeNode({
      nodeId: 'preview',
      toolsetName: 'MCP tools',
      toolSetId: 'app-id',
      tool: { name: 'search', description: '', inputSchema: { type: 'object', properties: {} } }
    });
    const node = {
      ...getMCPToolSetRuntimeNode({ url: '', toolList: [] }),
      nodeId: 'toolset',
      name: 'MCP tools',
      pluginId: 'app-id',
      toolConfig: {
        mcpToolSet: { toolId: 'app-id', toolList: [{ name: 'search', description: '' }] }
      }
    };

    expect(
      getToolSetDebugRuntimeNode({ toolSetNode: node, toolIndex: 0, previewNode: preview })
    ).toMatchObject({
      nodeId: 'toolset',
      name: 'MCP tools/search',
      inputs: preview.inputs,
      toolConfig: { mcpTool: { toolId: 'mcp-app-id/search' } }
    });
    expect(
      getToolSetDebugRuntimeNode({ toolSetNode: node, toolIndex: 1, previewNode: preview })
    ).toBeUndefined();
  });

  it('loads the remote HTTP definition and carries node descriptions and config into debug', async () => {
    const apiSchemaUrl = 'https://api.example.com/openapi.json';
    const apiSchema = { openapi: '3.1.0', paths: {} };
    const serverPath = 'https://api.example.com/v2';
    const baseUrl = 'https://gateway.example.com/v2';
    const customHeaders = '{"X-Team":"shared"}';
    const headerSecret = { Authorization: { value: 'Bearer token' } };
    const remoteTool = {
      name: 'search',
      description: 'Remote description',
      path: '/search',
      method: 'GET'
    };
    httpDebugMocks.getApiSchemaByUrl.mockResolvedValue(apiSchema);
    httpDebugMocks.str2OpenApiSchema.mockResolvedValue({ pathData: {}, serverPath });
    httpDebugMocks.pathData2ToolList.mockResolvedValue([remoteTool]);

    const toolSetNode = getHTTPToolSetRuntimeNode({ name: 'HTTP tools' });
    toolSetNode.nodeId = 'http-toolset';
    toolSetNode.toolConfig = {
      httpToolSet: {
        apiSchemaUrl,
        baseUrl,
        customHeaders,
        headerSecret,
        toolList: [{ name: 'search', description: 'Node description' }]
      }
    };

    const debugData = await getToolSetDebugData(toolSetNode);
    const runtimeNode = getToolSetDebugRuntimeNode({
      toolSetNode,
      toolIndex: 0,
      debugData
    });

    expect(httpDebugMocks.getApiSchemaByUrl).toHaveBeenCalledWith(apiSchemaUrl);
    expect(debugData).toMatchObject({
      type: 'http',
      serverPath,
      toolList: [{ name: 'search', description: 'Node description' }]
    });
    expect(runtimeNode?.toolConfig?.httpTool).toMatchObject({
      name: 'search',
      baseUrl,
      apiSchemaStr: JSON.stringify(apiSchema),
      customHeaders,
      headerSecret
    });
  });
});
