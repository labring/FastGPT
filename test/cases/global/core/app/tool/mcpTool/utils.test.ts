import { describe, expect, it } from 'vitest';
import {
  getMCPToolSetRuntimeNode,
  getMCPToolRuntimeNode,
  getMCPParentId
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
        toolList,
        toolId: 'mcp-tool-123'
      });

      expect(result.flowNodeType).toBe(FlowNodeTypeEnum.toolSet);
      expect(result.intro).toBe('MCP Tools');
      expect(result.inputs).toEqual([]);
      expect(result.outputs).toEqual([]);
      expect(result.name).toBe('');
      expect(result.nodeId).toHaveLength(16);
      expect(result.toolConfig?.mcpToolSet?.url).toBe('https://mcp.example.com/api');
      expect(result.toolConfig?.mcpToolSet?.toolList).toEqual(toolList);
      expect(result.toolConfig?.mcpToolSet?.toolId).toBe('mcp-tool-123');
    });

    it('should create runtime node with all optional params', () => {
      const toolList: McpToolConfigType[] = [];

      const result = getMCPToolSetRuntimeNode({
        url: 'https://mcp.example.com/api',
        toolList,
        toolId: 'mcp-tool-456',
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
        toolSetId: 'toolset-456'
      });

      expect(result.nodeId).toBe('node-123');
      expect(result.flowNodeType).toBe(FlowNodeTypeEnum.tool);
      expect(result.avatar).toBe('core/app/type/mcpToolsFill');
      expect(result.intro).toBe('Search for information');
      expect(result.name).toBe('searchTool');
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
        toolSetId: 'toolset-abc'
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
        toolSetId: 'toolset-002'
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
        toolSetId: 'parent-123'
      });

      expect(result.toolConfig?.mcpTool?.toolId).toBe('mcp-parent-123/myTool');
    });
  });

  describe('getMCPParentId', () => {
    it('should extract parentId from mcp-parentId/toolName format', () => {
      const result = getMCPParentId('mcp-123456/searchTool');
      expect(result).toBe('123456');
    });

    it('should extract parentId from parentId/toolName format', () => {
      const result = getMCPParentId('123456/searchTool');
      expect(result).toBe('123456');
    });

    it('should extract parentId from mcp-parentId format (no tool name)', () => {
      const result = getMCPParentId('mcp-123456');
      expect(result).toBe('123456');
    });

    it('should handle complex parentId with multiple dashes', () => {
      const result = getMCPParentId('mcp-abc-def-123/toolName');
      expect(result).toBe('123');
    });

    it('should handle parentId without prefix', () => {
      const result = getMCPParentId('507f1f77bcf86cd799439011/myTool');
      expect(result).toBe('507f1f77bcf86cd799439011');
    });

    it('should return empty string for empty string input', () => {
      const result = getMCPParentId('');
      expect(result).toBe('');
    });

    it('should handle id with only prefix', () => {
      const result = getMCPParentId('mcp-');
      expect(result).toBe('');
    });
  });
});
