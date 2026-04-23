import { describe, expect, it } from 'vitest';
import {
  McpToolConfigSchema,
  McpToolSetDataTypeSchema,
  McpToolDataTypeSchema
} from '@fastgpt/global/core/app/tool/mcpTool/type';

describe('mcpTool type schemas', () => {
  describe('McpToolConfigSchema', () => {
    it('should validate valid tool config', () => {
      const validConfig = {
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

      const result = McpToolConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('should validate config with empty input schema', () => {
      const validConfig = {
        name: 'simpleTool',
        description: 'A simple tool',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      };

      const result = McpToolConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('should reject config without name', () => {
      const invalidConfig = {
        description: 'Missing name',
        inputSchema: { type: 'object', properties: {}, required: [] }
      };

      const result = McpToolConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject config without description', () => {
      const invalidConfig = {
        name: 'noDescription',
        inputSchema: { type: 'object', properties: {}, required: [] }
      };

      const result = McpToolConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });
  });

  describe('McpToolSetDataTypeSchema', () => {
    it('should validate valid tool set data', () => {
      const validData = {
        url: 'https://mcp.example.com/api',
        toolList: [
          {
            name: 'tool1',
            description: 'First tool',
            inputSchema: { type: 'object', properties: {}, required: [] }
          },
          {
            name: 'tool2',
            description: 'Second tool',
            inputSchema: { type: 'object', properties: {}, required: [] }
          }
        ]
      };

      const result = McpToolSetDataTypeSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate tool set with header secret', () => {
      const validData = {
        url: 'https://mcp.example.com/api',
        headerSecret: {
          value: 'secret-value',
          secret: ''
        },
        toolList: []
      };

      const result = McpToolSetDataTypeSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate tool set with empty tool list', () => {
      const validData = {
        url: 'https://mcp.example.com/api',
        toolList: []
      };

      const result = McpToolSetDataTypeSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject tool set without url', () => {
      const invalidData = {
        toolList: []
      };

      const result = McpToolSetDataTypeSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject tool set without toolList', () => {
      const invalidData = {
        url: 'https://mcp.example.com/api'
      };

      const result = McpToolSetDataTypeSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('McpToolDataTypeSchema', () => {
    it('should validate valid tool data with url', () => {
      const validData = {
        name: 'mcpTool',
        description: 'MCP tool with URL',
        inputSchema: {
          type: 'object',
          properties: {
            input: { type: 'string' }
          },
          required: []
        },
        url: 'https://mcp.example.com/tool'
      };

      const result = McpToolDataTypeSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate tool data with header secret', () => {
      const validData = {
        name: 'secureTool',
        description: 'Tool with secret',
        inputSchema: { type: 'object', properties: {}, required: [] },
        url: 'https://mcp.example.com/secure',
        headerSecret: {
          value: 'secret-value',
          secret: ''
        }
      };

      const result = McpToolDataTypeSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject tool data without url', () => {
      const invalidData = {
        name: 'noUrlTool',
        description: 'Missing URL',
        inputSchema: { type: 'object', properties: {}, required: [] }
      };

      const result = McpToolDataTypeSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should inherit validation from McpToolConfigSchema', () => {
      const invalidData = {
        url: 'https://mcp.example.com/tool'
        // missing name, description, inputSchema
      };

      const result = McpToolDataTypeSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });
});
