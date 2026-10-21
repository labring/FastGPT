import { describe, expect, it } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { checkWorkflowNodeResourceRules } from '../../../../../src/web/core/workflow/check/resource';

const getResourceIssues = (data: FlowNodeItemType) =>
  checkWorkflowNodeResourceRules({
    data,
    bindings: []
  });

describe('workflow node-local toolset checks', () => {
  it.each(['mcpToolSet', 'httpToolSet'] as const)('warns for an empty local %s', (toolSetKey) => {
    const issues = getResourceIssues({
      nodeId: 'tool-set',
      flowNodeType: FlowNodeTypeEnum.toolSet,
      name: 'Local toolset',
      inputs: [],
      outputs: [],
      toolConfig: { [toolSetKey]: { toolList: [] } }
    });

    expect(issues).toContainEqual({ code: 'tool_set_not_configured' });
  });

  it('does not warn for configured or externally referenced toolsets', () => {
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
