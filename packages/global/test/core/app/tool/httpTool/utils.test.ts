import { describe, expect, it } from 'vitest';
import {
  getHTTPToolSetRuntimeNode,
  getHTTPToolRuntimeNode,
  getHTTPToolRuntimeSchemas,
  completeOpenAPIRequestSchema,
  isHttpToolInputAgentGenerated,
  isLegacyManualHttpToolArrayType,
  jsonSchemaProperty2ManualHttpToolValueType,
  manualHttpToolValueType2JsonSchema,
  parseHttpToolConfig,
  pathData2ToolList,
  updateHttpToolInputProperty
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

describe('HTTP request schema compatibility', () => {
  it('preserves an explicit request schema without adding editor fields or empty required', () => {
    const requestSchema = { type: 'object', properties: { body: { type: 'object' } } };
    const inputSchema = {
      type: 'object',
      properties: { keyword: { type: 'string' } },
      required: ['keyword']
    };
    expect(getHTTPToolRuntimeSchemas({ requestSchema, inputSchema }).requestSchema).toBe(
      requestSchema
    );
    expect(requestSchema).not.toHaveProperty('required');
    expect(requestSchema.properties).not.toHaveProperty('keyword');
  });

  it('adds only explicitly declared OpenAPI parameters and preserves body constraints', () => {
    const requestSchema = {
      type: 'object',
      properties: { body: { type: 'object' } },
      required: ['body'],
      additionalProperties: false
    };
    const result = completeOpenAPIRequestSchema({
      requestSchema,
      parameters: [
        { in: 'query', name: 'q', schema: { type: 'string' } },
        {
          in: 'header',
          name: 'X-Trace',
          required: true,
          description: 'Trace ID',
          schema: { type: 'string' }
        },
        { in: 'path', name: 'id', schema: { type: 'string' } },
        { name: 'editorOnly', required: true, schema: { type: 'string' } }
      ]
    });
    expect(result).toMatchObject({
      additionalProperties: false,
      properties: {
        body: { type: 'object' },
        q: { type: 'string' },
        'X-Trace': { type: 'string', description: 'Trace ID' },
        id: { type: 'string' }
      },
      required: ['body', 'X-Trace', 'id']
    });
    expect(result?.properties).not.toHaveProperty('editorOnly');
    expect(requestSchema.required).toEqual(['body']);
    expect(requestSchema.properties).toEqual({ body: { type: 'object' } });
  });

  it('does not create required when adding only optional query parameters', () => {
    const result = completeOpenAPIRequestSchema({
      requestSchema: { type: 'object', properties: {} },
      parameters: [{ in: 'query', name: 'q', schema: { type: 'string' } }]
    });
    expect(result?.properties).toHaveProperty('q');
    expect(result).not.toHaveProperty('required');
  });

  it('keeps an existing empty required list and deduplicates declared requirements', () => {
    const parameter = { in: 'query', name: 'q', required: true, schema: { type: 'string' } };
    expect(
      completeOpenAPIRequestSchema({
        requestSchema: { type: 'object', properties: {}, required: [] },
        parameters: [{ ...parameter, required: false }]
      })?.required
    ).toEqual([]);
    expect(
      completeOpenAPIRequestSchema({
        requestSchema: { type: 'object', properties: {}, required: ['q'] },
        parameters: [parameter]
      })?.required
    ).toEqual(['q']);
  });

  it('does not alter schemas without explicit OpenAPI parameter declarations', () => {
    const requestSchema = { type: 'object', properties: { body: { type: 'object' } } };
    expect(completeOpenAPIRequestSchema({ requestSchema })).toBe(requestSchema);
    expect(
      completeOpenAPIRequestSchema({
        requestSchema,
        parameters: [{ in: 'body', name: 'body', schema: { type: 'object' } }]
      })
    ).toBe(requestSchema);
    expect(
      completeOpenAPIRequestSchema({
        parameters: [{ in: 'query', name: 'q', schema: { type: 'string' } }]
      })
    ).toBeUndefined();
  });
});

describe('httpTool utils', () => {
  describe('HTTP tool input mode', () => {
    it.each([
      {
        name: 'explicitly disabled input',
        property: {
          type: 'string',
          description: 'Query',
          'x-tool-description': 'Query',
          isToolParam: false
        },
        expected: false
      },
      {
        name: 'explicitly enabled input',
        property: {
          type: 'string',
          'x-tool-description': '',
          isToolParam: true
        },
        expected: true
      },
      {
        name: 'legacy manual input',
        property: { type: 'string', 'x-tool-description': '' },
        expected: false
      },
      {
        name: 'legacy agent input',
        property: { type: 'string', 'x-tool-description': 'Query' },
        expected: true
      }
    ])('$name', ({ property, expected }) => {
      expect(isHttpToolInputAgentGenerated(property)).toBe(expected);
    });

    it.each([
      { enabled: true, expectedDescription: 'Query' },
      { enabled: false, expectedDescription: '' }
    ])('persists the enabled state ($enabled)', ({ enabled, expectedDescription }) => {
      const property = updateHttpToolInputProperty({
        key: 'query',
        property: {
          type: 'string',
          description: 'Query',
          pattern: '^[a-z]+$',
          'x-tool-description': 'Old description',
          isToolParam: !enabled
        },
        enabled
      });

      expect(property).toMatchObject({
        type: 'string',
        description: 'Query',
        pattern: '^[a-z]+$',
        'x-tool-description': expectedDescription,
        isToolParam: enabled
      });
    });

    it('uses the parameter key when an enabled input has no description', () => {
      expect(
        updateHttpToolInputProperty({
          key: 'query',
          property: { type: 'string', description: '' },
          enabled: true
        })
      ).toMatchObject({
        'x-tool-description': 'query',
        isToolParam: true
      });
    });
  });

  describe('manual HTTP tool schema conversion', () => {
    it.each([
      [
        WorkflowIOValueTypeEnum.arrayString,
        {
          type: 'array',
          items: { type: 'string' }
        }
      ],
      [
        WorkflowIOValueTypeEnum.arrayNumber,
        {
          type: 'array',
          items: { type: 'number' }
        }
      ],
      [
        WorkflowIOValueTypeEnum.arrayBoolean,
        {
          type: 'array',
          items: { type: 'boolean' }
        }
      ]
    ] as const)('converts %s to a standard JSON Schema array', (valueType, expectedSchema) => {
      expect(manualHttpToolValueType2JsonSchema(valueType)).toEqual(expectedSchema);
      expect(jsonSchemaProperty2ManualHttpToolValueType(expectedSchema)).toBe(valueType);
    });

    it('keeps legacy array value types available for editing before migration', () => {
      expect(isLegacyManualHttpToolArrayType('arrayString')).toBe(true);
      expect(isLegacyManualHttpToolArrayType('array')).toBe(false);
      expect(
        jsonSchemaProperty2ManualHttpToolValueType({
          type: WorkflowIOValueTypeEnum.arrayString
        })
      ).toBe(WorkflowIOValueTypeEnum.arrayString);
    });
  });

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
      expect(result.toolConfig?.httpTool).toMatchObject({
        toolId: `${AppToolSourceEnum.http}-toolset-456/searchTool`
      });
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

    it('should preserve legacy manual HTTP params and fall back from empty request schemas', () => {
      const result = getHTTPToolRuntimeNode({
        tool: {
          name: 'legacyTool',
          description: 'Legacy tool',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', 'x-tool-description': '' }
            },
            required: ['query']
          },
          requestSchema: { type: 'object' },
          outputSchema: { type: 'object', properties: {} }
        },
        nodeId: 'node-legacy',
        toolSetId: 'toolset-legacy',
        toolsetName: 'toolsetName'
      });

      expect(result.inputs[0]).toMatchObject({
        key: 'query',
        defaultToAgentGenerated: false
      });
      expect(result.jsonSchema).toEqual({
        type: 'object',
        properties: {
          query: { type: 'string', 'x-tool-description': '' }
        },
        required: ['query']
      });
    });

    it('should honor an explicit disabled mode for HTTP input properties', () => {
      const result = getHTTPToolRuntimeNode({
        tool: {
          name: 'openApiTool',
          description: 'OpenAPI tool',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Query',
                'x-tool-description': 'Query',
                isToolParam: false
              }
            },
            required: ['query']
          },
          outputSchema: { type: 'object', properties: {} }
        },
        nodeId: 'node-openapi-disabled',
        toolSetId: 'toolset-openapi',
        toolsetName: 'toolsetName'
      });

      expect(result.inputs[0]).toMatchObject({
        key: 'query',
        defaultToAgentGenerated: false
      });
    });

    it('should use request schema properties when the input schema is empty', () => {
      const result = getHTTPToolRuntimeNode({
        tool: {
          name: 'legacyTool',
          description: 'Legacy tool',
          inputSchema: { type: 'object' },
          requestSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Query', isToolParam: true }
            },
            required: ['query']
          },
          outputSchema: { type: 'object', properties: {} }
        },
        nodeId: 'node-legacy-request',
        toolSetId: 'toolset-legacy',
        toolsetName: 'toolsetName'
      });

      expect(result.inputs).toEqual([
        expect.objectContaining({
          key: 'query',
          defaultToAgentGenerated: true,
          required: true
        })
      ]);
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

    it('should preserve leading slash in tool name', () => {
      const result = parseHttpToolConfig({
        toolId: 'http-69e20f48dbec7c6ece77556b//test'
      });

      expect(result).toEqual({
        toolsetId: '69e20f48dbec7c6ece77556b',
        toolName: '/test'
      });
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
      expect(result[0].requestSchema).toEqual({
        type: 'object',
        properties: {
          id: { type: 'string', description: 'User ID', isToolParam: true },
          fields: { type: 'string', description: 'Fields to return', isToolParam: true }
        },
        required: ['id']
      });
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

    it('should read 2XX wildcard response schemas', async () => {
      const pathData: PathDataType[] = [
        {
          name: 'createTask',
          description: 'Create task',
          method: 'POST',
          path: '/tasks',
          params: [],
          request: {},
          response: {
            '2XX': {
              content: {
                'application/json': {
                  schema: {
                    properties: {
                      taskId: { type: 'string' },
                      state: { type: 'string' }
                    },
                    required: ['taskId']
                  }
                }
              }
            }
          }
        }
      ];

      const result = await pathData2ToolList(pathData);

      expect(result[0]?.outputSchema?.properties).toHaveProperty('taskId');
      expect(result[0]?.outputSchema?.properties).toHaveProperty('state');
      expect(result[0]?.outputSchema?.required).toContain('taskId');
    });

    it('should match the 2xx wildcard case-insensitively', async () => {
      const pathData: PathDataType[] = [
        {
          name: 'mixedCaseWildcard',
          description: 'Mixed case wildcard',
          method: 'GET',
          path: '/mixed-case',
          params: [],
          request: {},
          response: {
            '2Xx': {
              content: {
                'application/json': {
                  schema: { properties: { result: { type: 'string' } } }
                }
              }
            }
          }
        }
      ];

      const result = await pathData2ToolList(pathData);

      expect(result[0]?.outputSchema?.properties).toHaveProperty('result');
    });

    it('should prefer the success response that carries a JSON schema', async () => {
      // 206 声明在前、204 无响应体：整型键按数值升序枚举后是 204, 206，不能只取第一条。
      const pathData: PathDataType[] = [
        {
          name: 'downloadChunk',
          description: 'Download chunk',
          method: 'GET',
          path: '/chunks',
          params: [],
          request: {},
          response: {
            '206': {
              content: {
                'application/json': {
                  schema: {
                    properties: {
                      chunk: { type: 'string' },
                      total: { type: 'number' }
                    },
                    required: ['chunk']
                  }
                }
              }
            },
            '204': {
              description: 'No content'
            }
          }
        }
      ];

      const result = await pathData2ToolList(pathData);

      expect(result[0]?.outputSchema?.properties).toHaveProperty('chunk');
      expect(result[0]?.outputSchema?.properties).toHaveProperty('total');
      expect(result[0]?.outputSchema?.required).toContain('chunk');
    });

    it('should ignore non-object response definitions', async () => {
      const pathData: PathDataType[] = [
        {
          name: 'arrayResponse',
          description: 'Malformed responses',
          method: 'GET',
          path: '/malformed',
          params: [],
          request: {},
          response: ['200']
        }
      ];

      const result = await pathData2ToolList(pathData);

      expect(result).toHaveLength(1);
      expect(result[0]?.outputSchema?.properties).toEqual({});
    });

    it('should not let a __proto__ property name replace the schema prototype', async () => {
      const pathData: PathDataType[] = [
        {
          name: 'prototypeKeyTool',
          description: 'Prototype key',
          method: 'GET',
          path: '/prototype-key',
          params: [],
          request: {},
          response: {
            '200': {
              content: {
                'application/json': {
                  // 模拟来自 JSON 文本的 schema：`__proto__` 是合法但无法作为普通对象字段的键名
                  schema: JSON.parse(
                    '{"properties":{"__proto__":{"type":"string"},"name":{"type":"string"}},"required":["__proto__","name"]}'
                  )
                }
              }
            }
          }
        }
      ];

      const result = await pathData2ToolList(pathData);

      const properties = result[0]?.outputSchema?.properties ?? {};
      expect(Object.getPrototypeOf(properties)).toBe(Object.prototype);
      expect(Object.keys(properties)).toEqual(['name']);
      expect(result[0]?.outputSchema?.required).toEqual(['name']);
    });

    it('should keep other operations when one response schema has a malformed property', async () => {
      const pathData: PathDataType[] = [
        {
          name: 'normalTool',
          description: 'Normal tool',
          method: 'GET',
          path: '/normal',
          params: [],
          request: {},
          response: {
            '200': {
              content: {
                'application/json': {
                  schema: {
                    properties: { ok: { type: 'string' } },
                    required: ['ok']
                  }
                }
              }
            }
          }
        },
        {
          name: 'malformedTool',
          description: 'Malformed tool',
          method: 'GET',
          path: '/malformed-property',
          params: [],
          request: {},
          response: {
            '2XX': {
              content: {
                'application/json': {
                  schema: {
                    properties: { invalid: null },
                    required: ['invalid']
                  }
                }
              }
            }
          }
        }
      ];

      const result = await pathData2ToolList(pathData);

      expect(result).toHaveLength(2);
      expect(result[0]?.outputSchema?.properties).toHaveProperty('ok');
      expect(result[0]?.outputSchema?.required).toContain('ok');
      expect(result[1]?.outputSchema?.properties).toEqual({});
      expect(result[1]?.outputSchema?.required).toEqual([]);
    });

    it('should map true to any and skip false boolean schemas', async () => {
      const pathData: PathDataType[] = [
        {
          name: 'booleanSchemaTool',
          description: 'Boolean sub schema',
          method: 'GET',
          path: '/boolean-schema',
          params: [],
          request: {},
          response: {
            '200': {
              content: {
                'application/json': {
                  schema: {
                    // OAS 3.1 允许布尔子 Schema：true 表示任意值，false 表示禁止该字段
                    properties: { flag: true, retired: false, name: { type: 'string' } },
                    required: ['flag', 'name', 'retired', 'ghost']
                  }
                }
              }
            }
          }
        }
      ];

      const result = await pathData2ToolList(pathData);

      expect(result[0]?.outputSchema?.properties).toHaveProperty('flag');
      expect(result[0]?.outputSchema?.properties).toHaveProperty('name');
      expect(result[0]?.outputSchema?.properties?.flag.type).toBe('any');
      expect(result[0]?.outputSchema?.properties).not.toHaveProperty('retired');
      expect(result[0]?.outputSchema?.required).toEqual(expect.arrayContaining(['flag', 'name']));
      expect(result[0]?.outputSchema?.required).not.toContain('retired');
      expect(result[0]?.outputSchema?.required).not.toContain('ghost');
    });

    it('should skip a success response that only declares forbidden fields', async () => {
      const pathData: PathDataType[] = [
        {
          name: 'forbiddenOnlyFirst',
          description: 'Only forbidden fields',
          method: 'GET',
          path: '/forbidden-only',
          params: [],
          request: {},
          response: {
            '203': {
              content: {
                'application/json': {
                  schema: { properties: { retired: false } }
                }
              }
            },
            '206': {
              content: {
                'application/json': {
                  schema: { properties: { chunk: { type: 'string' } }, required: ['chunk'] }
                }
              }
            }
          }
        }
      ];

      const result = await pathData2ToolList(pathData);

      expect(result[0]?.outputSchema?.properties).toHaveProperty('chunk');
      expect(result[0]?.outputSchema?.properties).not.toHaveProperty('retired');
      expect(result[0]?.outputSchema?.required).toEqual(['chunk']);
    });

    it('should not fall back to default when the document declares success responses', async () => {
      const pathData: PathDataType[] = [
        {
          name: 'bodylessSuccess',
          description: 'Bodyless success',
          method: 'POST',
          path: '/bodyless',
          params: [],
          request: {},
          response: {
            '200': { description: 'No body' },
            '2XX': { description: 'No body' },
            default: {
              content: {
                'application/json': {
                  schema: {
                    properties: { errorCode: { type: 'string' } },
                    required: ['errorCode']
                  }
                }
              }
            }
          }
        }
      ];

      const result = await pathData2ToolList(pathData);

      expect(result[0]?.outputSchema?.properties).toEqual({});
      expect(result[0]?.outputSchema?.required).toEqual([]);
    });

    it('should still use default when no success response is declared', async () => {
      const pathData: PathDataType[] = [
        {
          name: 'defaultOnly',
          description: 'Default only',
          method: 'GET',
          path: '/default-only',
          params: [],
          request: {},
          response: {
            default: {
              content: {
                'application/json': {
                  schema: { properties: { message: { type: 'string' } } }
                }
              }
            }
          }
        }
      ];

      const result = await pathData2ToolList(pathData);

      expect(result[0]?.outputSchema?.properties).toHaveProperty('message');
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
