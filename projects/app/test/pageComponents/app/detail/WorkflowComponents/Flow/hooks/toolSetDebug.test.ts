import { describe, expect, it } from 'vitest';
import {
  getMCPToolRuntimeNode,
  getMCPToolSetRuntimeNode
} from '@fastgpt/global/core/app/tool/mcpTool/utils';
import { getHTTPToolSetRuntimeNode } from '@fastgpt/global/core/app/tool/httpTool/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getToolSetDebugRuntimeNode } from '@/pageComponents/app/detail/WorkflowComponents/Flow/hooks/toolSetDebug';

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

    const result = getToolSetDebugRuntimeNode({ toolSetNode: node, toolIndex: 1 });

    expect(result).toMatchObject({
      nodeId: 'toolset',
      flowNodeType: FlowNodeTypeEnum.tool,
      name: 'MCP tools/second',
      toolConfig: { mcpTool: { name: 'second', url: 'https://mcp.example.com' } }
    });
    expect(result?.inputs.map((input) => input.key)).toEqual(['query']);
  });

  it('keeps inline HTTP execution config and parent node ID', () => {
    const node = getHTTPToolSetRuntimeNode({
      name: 'HTTP tools',
      baseUrl: 'https://api.example.com',
      customHeaders: '{}',
      toolList: [
        {
          name: 'search',
          description: '',
          path: '/search',
          method: 'GET',
          inputSchema: { type: 'object', properties: { query: { type: 'string' } } }
        }
      ]
    });
    node.nodeId = 'toolset';

    const result = getToolSetDebugRuntimeNode({ toolSetNode: node, toolIndex: 0 });

    expect(result).toMatchObject({
      nodeId: 'toolset',
      flowNodeType: FlowNodeTypeEnum.tool,
      toolConfig: {
        httpTool: {
          name: 'search',
          path: '/search',
          method: 'GET',
          baseUrl: 'https://api.example.com',
          customHeaders: '{}'
        }
      }
    });
    expect(result?.toolConfig?.httpTool).not.toHaveProperty('toolId');
  });

  it('uses a referenced child preview and rejects unavailable children', () => {
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

    expect(getToolSetDebugRuntimeNode({ toolSetNode: node, toolIndex: 0 })).toBeUndefined();
    expect(
      getToolSetDebugRuntimeNode({ toolSetNode: node, toolIndex: 1, previewNode: preview })
    ).toBeUndefined();
    expect(
      getToolSetDebugRuntimeNode({ toolSetNode: node, toolIndex: 0, previewNode: preview })
    ).toMatchObject({
      nodeId: 'toolset',
      name: 'MCP tools/search',
      inputs: preview.inputs,
      toolConfig: { mcpTool: { toolId: 'mcp-app-id/search' } }
    });
  });
});
