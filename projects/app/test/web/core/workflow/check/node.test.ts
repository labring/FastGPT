import { describe, expect, it } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { checkWorkflowNodeResourceRules } from '../../../../../src/web/core/workflow/check/resource';

const getResourceIssues = (data: FlowNodeItemType) =>
  checkWorkflowNodeResourceRules({
    data,
    bindings: []
  });

describe('workflow node-local MCP toolset checks', () => {
  it('warns for empty local MCP toolsets', () => {
    const issues = getResourceIssues({
      nodeId: 'mcp-set',
      flowNodeType: FlowNodeTypeEnum.toolSet,
      name: 'Local MCP',
      inputs: [],
      outputs: [],
      toolConfig: { mcpToolSet: { url: '', toolList: [] } }
    });

    expect(issues).toContainEqual({ code: 'tool_set_not_configured' });
  });

  it('does not warn for configured or externally referenced MCP toolsets', () => {
    const configured = getResourceIssues({
      nodeId: 'mcp-set',
      flowNodeType: FlowNodeTypeEnum.toolSet,
      name: 'Local MCP',
      inputs: [],
      outputs: [],
      toolConfig: {
        mcpToolSet: {
          url: 'https://mcp.example.com',
          toolList: [{ name: 'search', description: 'Search' }]
        }
      }
    });
    const referenced = getResourceIssues({
      nodeId: 'mcp-reference',
      flowNodeType: FlowNodeTypeEnum.toolSet,
      name: 'External MCP',
      pluginId: 'mcp-app',
      inputs: [],
      outputs: [],
      toolConfig: { mcpToolSet: { toolId: 'mcp-app', toolList: [] } }
    });

    expect(configured).not.toContainEqual({ code: 'tool_set_not_configured' });
    expect(referenced).not.toContainEqual({ code: 'tool_set_not_configured' });
  });
});

describe('workflow node-local HTTP toolset checks', () => {
  it('warns for empty local HTTP toolsets but not configured or external references', () => {
    const empty = getResourceIssues({
      nodeId: 'http-set',
      flowNodeType: FlowNodeTypeEnum.toolSet,
      name: 'Local HTTP',
      inputs: [],
      outputs: [],
      toolConfig: { httpToolSet: { toolList: [] } }
    });
    const configured = getResourceIssues({
      nodeId: 'http-set',
      flowNodeType: FlowNodeTypeEnum.toolSet,
      name: 'Local HTTP',
      inputs: [],
      outputs: [],
      toolConfig: {
        httpToolSet: {
          toolList: [
            {
              name: 'search',
              description: 'Search',
              path: '/search',
              method: 'get'
            }
          ]
        }
      }
    });
    const referenced = getResourceIssues({
      nodeId: 'http-reference',
      flowNodeType: FlowNodeTypeEnum.toolSet,
      name: 'External HTTP',
      pluginId: 'http-app',
      inputs: [],
      outputs: [],
      toolConfig: { httpToolSet: { toolId: 'http-app', toolList: [] } }
    });

    expect(empty).toContainEqual({ code: 'tool_set_not_configured' });
    expect(configured).not.toContainEqual({ code: 'tool_set_not_configured' });
    expect(referenced).not.toContainEqual({ code: 'tool_set_not_configured' });
  });
});
