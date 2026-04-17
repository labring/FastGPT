import { describe, expect, it } from 'vitest';
import {
  getMCPToolSetRuntimeNode,
  getMCPToolRuntimeNode,
  parsetMcpToolConfig
} from '@fastgpt/global/core/app/tool/mcpTool/utils';
import {
  FlowNodeTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import type { McpToolConfigType } from '@fastgpt/global/core/app/tool/mcpTool/type';

describe('mcpTool utils', () => {
  describe('getMCPToolSetRuntimeNode', () => {
    it('should create runtime node with required params', () => {
      const toolList: McpToolConfigType[] = [
        {
          name: 'searchTool',
          description: 'Search tool',
          inputSchema: { type: 'object', properties: {}, required: [] }
        }
      ];

      const result = getMCPToolSetRuntimeNode({
        url: 'https://mcp.example.com/api',
        toolList
      });

      expect(result.flowNodeType).toBe(FlowNodeTypeEnum.toolSet);
      expect(result.intro).toBe('MCP Tools');
      expect(result.inputs).toEqual([]);
      expect(result.outputs).toEqual([]);
      expect(result.name).toBe('');
      expect(result.nodeId).toHaveLength(16);
      expect(result.toolConfig?.mcpToolSet?.url).toBe('https://mcp.example.com/api');
      expect(result.toolConfig?.mcpToolSet?.toolList).toEqual(toolList);
    });

    it('should create runtime node with all optional params', () => {
      const toolList: McpToolConfigType[] = [];

      const result = getMCPToolSetRuntimeNode({
        url: 'https://mcp.example.com/api',
        toolList,
        name: 'My MCP Tools',
        avatar: 'custom-mcp-avatar',
        headerSecret: { id: 'secret-1', key: 'Authorization' }
      });

      expect(result.name).toBe('My MCP Tools');
      expect(result.avatar).toBe('custom-mcp-avatar');
      expect(result.toolConfig?.mcpToolSet?.headerSecret).toEqual({
        id: 'secret-1',
        key: 'Authorization'
      });
    });
  });

  describe('getMCPToolRuntimeNode', () => {
    it('should create tool runtime node with required params', () => {
      const tool: McpToolConfigType = {
        name: 'searchTool',
        description: 'Search for information',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' }
          },
          required: ['query']
        }
      };

      const result = getMCPToolRuntimeNode({
        tool,
        nodeId: 'node-123',
        toolSetId: 'toolset-456',
        toolsetName: 'toolsetName'
      });

      expect(result.nodeId).toBe('node-123');
      expect(result.flowNodeType).toBe(FlowNodeTypeEnum.tool);
      expect(result.avatar).toBe('core/app/type/mcpToolsFill');
      expect(result.intro).toBe('Search for information');
      expect(result.name).toBe('toolsetName/searchTool');
      expect(result.toolConfig?.mcpTool?.toolId).toBe(
        `${AppToolSourceEnum.mcp}-toolset-456/searchTool`
      );
    });

    it('should create tool runtime node with custom avatar', () => {
      const tool: McpToolConfigType = {
        name: 'customTool',
        description: 'Custom tool',
        inputSchema: { type: 'object', properties: {}, required: [] }
      };

      const result = getMCPToolRuntimeNode({
        tool,
        nodeId: 'node-789',
        avatar: 'custom-icon',
        toolSetId: 'toolset-abc',
        toolsetName: 'toolsetName'
      });

      expect(result.avatar).toBe('custom-icon');
    });

    it('should include rawResponse output', () => {
      const tool: McpToolConfigType = {
        name: 'apiTool',
        description: 'API tool',
        inputSchema: { type: 'object', properties: {}, required: [] }
      };

      const result = getMCPToolRuntimeNode({
        tool,
        nodeId: 'node-001',
        toolSetId: 'toolset-002',
        toolsetName: 'toolsetName'
      });

      expect(result.outputs).toHaveLength(1);
      const rawResponseOutput = result.outputs[0];
      expect(rawResponseOutput.key).toBe(NodeOutputKeyEnum.rawResponse);
      expect(rawResponseOutput.valueType).toBe(WorkflowIOValueTypeEnum.any);
      expect(rawResponseOutput.type).toBe(FlowNodeOutputTypeEnum.static);
      expect(rawResponseOutput.required).toBe(true);
    });

    it('should generate correct toolId format', () => {
      const tool: McpToolConfigType = {
        name: 'myTool',
        description: 'My tool',
        inputSchema: { type: 'object', properties: {}, required: [] }
      };

      const result = getMCPToolRuntimeNode({
        tool,
        nodeId: 'node-test',
        toolSetId: 'parent-123',
        toolsetName: 'toolsetName'
      });

      expect(result.toolConfig?.mcpTool?.toolId).toBe('mcp-parent-123/myTool');
    });
  });

  describe('parsetMcpToolConfig', () => {
    it('should return toolSetId directly when it is provided', () => {
      const result = parsetMcpToolConfig({
        toolSetId: 'toolset-123',
        toolId: 'mcp-toolset-999/someTool'
      });

      expect(result).toBe('toolset-123');
    });

    it('should parse toolSetId from toolId when toolSetId is missing', () => {
      const result = parsetMcpToolConfig({
        toolId: 'mcp-toolset-456/someTool'
      });

      expect(result).toBe('toolset-456');
    });

    it('should parse toolSetId from toolId when toolSetId is empty string', () => {
      const result = parsetMcpToolConfig({
        toolSetId: '',
        toolId: 'mcp-toolset-789/searchTool'
      });

      expect(result).toBe('toolset-789');
    });

    it('should return undefined when toolId does not match mcp- prefix pattern', () => {
      const result = parsetMcpToolConfig({
        toolId: 'system-foo/bar'
      });

      expect(result).toBeUndefined();
    });

    it('should return undefined when toolId has no slash separator', () => {
      const result = parsetMcpToolConfig({
        toolId: 'mcp-toolset-no-tool'
      });

      expect(result).toBeUndefined();
    });

    it('should return undefined when toolSetId segment is empty in toolId', () => {
      const result = parsetMcpToolConfig({
        toolId: 'mcp-/toolName'
      });

      expect(result).toBeUndefined();
    });

    it('should return undefined when toolId is empty string', () => {
      const result = parsetMcpToolConfig({
        toolId: ''
      });

      expect(result).toBeUndefined();
    });

    it('should parse toolSetId correctly when tool name contains additional slashes', () => {
      const result = parsetMcpToolConfig({
        toolId: 'mcp-toolset-abc/namespace/nestedTool'
      });

      expect(result).toBe('toolset-abc');
    });
  });
});
