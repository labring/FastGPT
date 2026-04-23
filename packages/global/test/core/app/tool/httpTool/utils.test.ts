import { describe, expect, it, vi } from 'vitest';
import {
  getHTTPToolSetRuntimeNode,
  getHTTPToolRuntimeNode,
  parseHttpToolConfig,
  pathData2ToolList
} from '@fastgpt/global/core/app/tool/httpTool/utils';
import {
  FlowNodeTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import type { HttpToolConfigType, PathDataType } from '@fastgpt/global/core/app/tool/httpTool/type';

describe('httpTool utils', () => {
  describe('getHTTPToolSetRuntimeNode', () => {
    it('should create runtime node with minimal params', () => {
      const result = getHTTPToolSetRuntimeNode({});

      expect(result.flowNodeType).toBe(FlowNodeTypeEnum.toolSet);
      expect(result.intro).toBe('HTTP Tools');
      expect(result.inputs).toEqual([]);
      expect(result.outputs).toEqual([]);
      expect(result.name).toBe('');
      expect(result.nodeId).toHaveLength(16);
      expect(result.toolConfig?.httpToolSet).toBeDefined();
    });

    it('should create runtime node with all params', () => {
      const toolList: HttpToolConfigType[] = [
        {
          name: 'testTool',
          description: 'Test tool',
          inputSchema: { type: 'object', properties: {}, required: [] },
          outputSchema: { type: 'object', properties: {}, required: [] },
          path: '/test',
          method: 'get'
        }
      ];

      const result = getHTTPToolSetRuntimeNode({
        name: 'My HTTP Tools',
        avatar: 'custom-avatar',
        baseUrl: 'https://api.example.com',
        customHeaders: 'Authorization: Bearer token',
        apiSchemaStr: '{"openapi": "3.0.0"}',
        toolList,
        headerSecret: {
          id: { value: 'secret-1' },
          key: { value: 'X-API-Key' }
        }
      });

      expect(result.name).toBe('My HTTP Tools');
      expect(result.avatar).toBe('custom-avatar');
      expect(result.toolConfig?.httpToolSet?.baseUrl).toBe('https://api.example.com');
      expect(result.toolConfig?.httpToolSet?.customHeaders).toBe('Authorization: Bearer token');
      expect(result.toolConfig?.httpToolSet?.apiSchemaStr).toBe('{"openapi": "3.0.0"}');
      expect(result.toolConfig?.httpToolSet?.toolList).toEqual(toolList);
      expect(result.toolConfig?.httpToolSet?.headerSecret).toEqual({
        id: { value: 'secret-1' },
        key: { value: 'X-API-Key' }
      });
    });

    it('should not include undefined optional fields', () => {
      const result = getHTTPToolSetRuntimeNode({
        name: 'Test',
        toolList: []
      });

      expect(result.toolConfig?.httpToolSet?.baseUrl).toBeUndefined();
      expect(result.toolConfig?.httpToolSet?.customHeaders).toBeUndefined();
      expect(result.toolConfig?.httpToolSet?.apiSchemaStr).toBeUndefined();
      expect(result.toolConfig?.httpToolSet?.headerSecret).toBeUndefined();
    });
  });

  describe('getHTTPToolRuntimeNode', () => {
    it('should create tool runtime node with required params', () => {
      const tool: any = {
        name: 'searchTool',
        description: 'Search for items',
        inputSchema: {
          type: 'object' as const,
          properties: {
            query: { type: 'string', description: 'Search query' }
          },
          required: ['query']
        },
        outputSchema: {
          type: 'object' as const,
          properties: {
            results: { type: 'array', description: 'Search results' }
          },
          required: []
        }
      };

      const result = getHTTPToolRuntimeNode({
        tool,
        nodeId: 'node-123',
        toolSetId: 'toolset-456',
        toolsetName: 'toolsetName'
      });

      expect(result.nodeId).toBe('node-123');
      expect(result.flowNodeType).toBe(FlowNodeTypeEnum.tool);
      expect(result.avatar).toBe('core/app/type/httpToolsFill');
      expect(result.intro).toBe('Search for items');
      expect(result.name).toBe('toolsetName/searchTool');
      expect(result.toolConfig?.httpTool?.toolId).toBe(
        `${AppToolSourceEnum.http}-toolset-456/searchTool`
      );
    });

    it('should create tool runtime node with custom avatar', () => {
      const tool = {
        name: 'customTool',
        description: 'Custom tool',
        inputSchema: { type: 'object' as const, properties: {}, required: [] },
        outputSchema: { type: 'object' as const, properties: {}, required: [] }
      };

      const result = getHTTPToolRuntimeNode({
        tool,
        nodeId: 'node-789',
        avatar: 'custom-icon',
        toolSetId: 'toolset-abc',
        toolsetName: 'toolsetName'
      });

      expect(result.avatar).toBe('custom-icon');
    });

    it('should include rawResponse output', () => {
      const tool = {
        name: 'apiTool',
        description: 'API tool',
        inputSchema: { type: 'object' as const, properties: {}, required: [] },
        outputSchema: { type: 'object' as const, properties: {}, required: [] }
      };

      const result = getHTTPToolRuntimeNode({
        tool,
        nodeId: 'node-001',
        toolSetId: 'toolset-002',
        toolsetName: 'toolsetName'
      });

      const rawResponseOutput = result.outputs.find((o) => o.key === NodeOutputKeyEnum.rawResponse);
      expect(rawResponseOutput).toBeDefined();
      expect(rawResponseOutput?.valueType).toBe(WorkflowIOValueTypeEnum.any);
      expect(rawResponseOutput?.type).toBe(FlowNodeOutputTypeEnum.static);
      expect(rawResponseOutput?.required).toBe(true);
    });
  });

  describe('parseHttpToolConfig', () => {
    it('should parse toolsetId and toolName from a valid toolId', () => {
      const result = parseHttpToolConfig({
        toolId: 'http-toolset-456/someTool'
      });

      expect(result).toEqual({ toolsetId: 'toolset-456', toolName: 'someTool' });
    });

    it('should return undefined when toolId does not match http- prefix pattern', () => {
      const result = parseHttpToolConfig({
        toolId: 'mcp-foo/bar'
      });

      expect(result).toBeUndefined();
    });

    it('should return undefined when toolId has no slash separator', () => {
      const result = parseHttpToolConfig({
        toolId: 'http-toolset-no-tool'
      });

      expect(result).toBeUndefined();
    });

    it('should return undefined when toolsetId segment is empty in toolId', () => {
      const result = parseHttpToolConfig({
        toolId: 'http-/toolName'
      });

      expect(result).toBeUndefined();
    });

    it('should return undefined when toolName segment is empty in toolId', () => {
      const result = parseHttpToolConfig({
        toolId: 'http-toolset-abc/'
      });

      expect(result).toBeUndefined();
    });

    it('should return undefined when toolId is empty string', () => {
      const result = parseHttpToolConfig({
        toolId: ''
      });

      expect(result).toBeUndefined();
    });

    it('should preserve slashes inside tool name', () => {
      const result = parseHttpToolConfig({
        toolId: 'http-toolset-abc/namespace/nestedTool'
      });

      expect(result).toEqual({ toolsetId: 'toolset-abc', toolName: 'namespace/nestedTool' });
    });

    it('should preserve multiple slashes inside tool name', () => {
      const result = parseHttpToolConfig({
        toolId: 'http-toolset-xyz/a/b/c/d'
      });

      expect(result).toEqual({ toolsetId: 'toolset-xyz', toolName: 'a/b/c/d' });
    });
  });

  describe('pathData2ToolList', () => {
    it('should convert simple path data to tool list', async () => {
      const pathData: PathDataType[] = [
        {
          name: 'getUsers',
          description: 'Get all users',
          method: 'GET',
          path: '/users',
          params: [],
          request: {},
          response: {}
        }
      ];

      const result = await pathData2ToolList(pathData);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('getUsers');
      expect(result[0].description).toBe('Get all users');
      expect(result[0].method).toBe('get');
      expect(result[0].path).toBe('/users');
    });

    it('should extract params from path data', async () => {
      const pathData: PathDataType[] = [
        {
          name: 'getUserById',
          description: 'Get user by ID',
          method: 'GET',
          path: '/users/{id}',
          params: [
            {
              name: 'id',
              description: 'User ID',
              required: true,
              schema: { type: 'string' }
            },
            {
              name: 'fields',
              description: 'Fields to return',
              required: false,
              schema: { type: 'string' }
            }
          ],
          request: {},
          response: {}
        }
      ];

      const result = await pathData2ToolList(pathData);

      expect(result[0].inputSchema.properties).toHaveProperty('id');
      expect(result[0].inputSchema.properties?.id.type).toBe('string');
      expect(result[0].inputSchema.properties?.id.description).toBe('User ID');
      expect(result[0].inputSchema.properties?.id['x-tool-description']).toBe('User ID');
      expect(result[0].inputSchema.properties?.fields['x-tool-description']).toBe(
        'Fields to return'
      );
      expect(result[0].inputSchema.required).toContain('id');
      expect(result[0].inputSchema.required).not.toContain('fields');
    });

    it('should fallback x-tool-description to param name when description missing', async () => {
      const pathData: PathDataType[] = [
        {
          name: 'noDescTool',
          description: '',
          method: 'GET',
          path: '/x',
          params: [{ name: 'foo', schema: { type: 'string' } }],
          request: {},
          response: {}
        }
      ];

      const result = await pathData2ToolList(pathData);

      expect(result[0].inputSchema.properties?.foo['x-tool-description']).toBe('foo');
    });

    it('should extract request body schema', async () => {
      const pathData: PathDataType[] = [
        {
          name: 'createUser',
          description: 'Create a new user',
          method: 'POST',
          path: '/users',
          params: [],
          request: {
            content: {
              'application/json': {
                schema: {
                  properties: {
                    name: { type: 'string', description: 'User name' },
                    email: { type: 'string', description: 'User email' }
                  },
                  required: ['name', 'email']
                }
              }
            }
          },
          response: {}
        }
      ];

      const result = await pathData2ToolList(pathData);

      expect(result[0].inputSchema.properties).toHaveProperty('name');
      expect(result[0].inputSchema.properties).toHaveProperty('email');
      expect(result[0].inputSchema.properties?.name['x-tool-description']).toBe('User name');
      expect(result[0].inputSchema.properties?.email['x-tool-description']).toBe('User email');
      expect(result[0].inputSchema.required).toContain('name');
      expect(result[0].inputSchema.required).toContain('email');
    });

    it('should extract response schema from 200 status', async () => {
      const pathData: PathDataType[] = [
        {
          name: 'getUser',
          description: 'Get user',
          method: 'GET',
          path: '/user',
          params: [],
          request: {},
          response: {
            '200': {
              content: {
                'application/json': {
                  schema: {
                    properties: {
                      id: { type: 'string', description: 'User ID' },
                      name: { type: 'string', description: 'User name' }
                    },
                    required: ['id']
                  }
                }
              }
            }
          }
        }
      ];

      const result = await pathData2ToolList(pathData);

      expect(result[0].outputSchema.properties).toHaveProperty('id');
      expect(result[0].outputSchema.properties).toHaveProperty('name');
      expect(result[0].outputSchema.required).toContain('id');
    });

    it('should fallback to 201, 202, or default response', async () => {
      const pathData: PathDataType[] = [
        {
          name: 'createResource',
          description: 'Create resource',
          method: 'POST',
          path: '/resources',
          params: [],
          request: {},
          response: {
            '201': {
              content: {
                'application/json': {
                  schema: {
                    properties: {
                      resourceId: { type: 'string' }
                    },
                    required: ['resourceId']
                  }
                }
              }
            }
          }
        }
      ];

      const result = await pathData2ToolList(pathData);

      expect(result[0].outputSchema.properties).toHaveProperty('resourceId');
    });

    it('should handle empty path data', async () => {
      const result = await pathData2ToolList([]);
      expect(result).toEqual([]);
    });

    it('should use name as description fallback', async () => {
      const pathData: PathDataType[] = [
        {
          name: 'noDescriptionTool',
          description: '',
          method: 'GET',
          path: '/test',
          params: [],
          request: {},
          response: {}
        }
      ];

      const result = await pathData2ToolList(pathData);

      expect(result[0].description).toBe('noDescriptionTool');
    });

    it('should handle params without schema', async () => {
      const pathData: PathDataType[] = [
        {
          name: 'testTool',
          description: 'Test',
          method: 'GET',
          path: '/test',
          params: [
            { name: 'validParam', schema: { type: 'string' } },
            { name: 'invalidParam' } // no schema
          ],
          request: {},
          response: {}
        }
      ];

      const result = await pathData2ToolList(pathData);

      expect(result[0].inputSchema.properties).toHaveProperty('validParam');
      expect(result[0].inputSchema.properties).not.toHaveProperty('invalidParam');
    });

    it('should handle type fallback to any', async () => {
      const pathData: PathDataType[] = [
        {
          name: 'anyTypeTool',
          description: 'Tool with any type',
          method: 'GET',
          path: '/test',
          params: [{ name: 'param1', schema: {}, description: 'No type specified' }],
          request: {},
          response: {}
        }
      ];

      const result = await pathData2ToolList(pathData);

      expect(result[0].inputSchema.properties?.param1.type).toBe('any');
    });

    it('should return empty array on error', async () => {
      // Pass invalid data that would cause an error
      const result = await pathData2ToolList(null as any);
      expect(result).toEqual([]);
    });
  });
});
