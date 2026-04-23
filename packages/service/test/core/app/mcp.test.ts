import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Hoisted mocks ---
const { mockDereference, mockMongoAppFind } = vi.hoisted(() => ({
  mockDereference: vi.fn(),
  mockMongoAppFind: vi.fn()
}));

vi.mock('@apidevtools/json-schema-ref-parser', () => ({
  default: {
    dereference: (...args: any[]) => mockDereference(...args)
  }
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    find: mockMongoAppFind
  }
}));

import { MCPClient, getMCPChildren } from '@fastgpt/service/core/app/mcp';
import type { AppSchemaType } from '@fastgpt/global/core/app/type';

// Access private client via prototype for spying
const getPrivateClient = (mcpClient: MCPClient) =>
  (mcpClient as any).client as {
    connect: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    listTools: ReturnType<typeof vi.fn>;
    callTool: ReturnType<typeof vi.fn>;
  };

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('MCPClient', () => {
  const config = { url: 'http://localhost:3000/mcp', headers: { Authorization: 'Bearer test' } };

  // Helper: stub getConnection to avoid real network calls
  const stubConnection = (mcpClient: MCPClient) => {
    const client = getPrivateClient(mcpClient);
    client.connect = vi.fn().mockResolvedValue(undefined);
    client.close = vi.fn().mockResolvedValue(undefined);
    client.listTools = vi.fn();
    client.callTool = vi.fn();
    // Stub getConnection to skip real transport creation
    (mcpClient as any).getConnection = vi.fn().mockResolvedValue(client);
    return client;
  };

  describe('constructor', () => {
    it('should create client with url and headers', () => {
      const client = new MCPClient(config);
      expect(client).toBeDefined();
      expect((client as any).url).toBe(config.url);
      expect((client as any).headers).toEqual(config.headers);
    });
  });

  describe('closeConnection', () => {
    it('should close connection successfully', async () => {
      const mcpClient = new MCPClient(config);
      const client = getPrivateClient(mcpClient);
      client.close = vi.fn().mockResolvedValue(undefined);

      await mcpClient.closeConnection();
      expect(client.close).toHaveBeenCalled();
    });

    it('should not throw when close fails', async () => {
      const mcpClient = new MCPClient(config);
      const client = getPrivateClient(mcpClient);
      client.close = vi.fn().mockRejectedValue(new Error('close failed'));

      await expect(mcpClient.closeConnection()).resolves.toBeUndefined();
    });
  });

  describe('getTools', () => {
    it('should return processed tools list', async () => {
      const mcpClient = new MCPClient(config);
      const client = stubConnection(mcpClient);

      const rawTools = [
        {
          name: 'tool1',
          description: 'desc1',
          inputSchema: { type: 'object', properties: { a: { type: 'string' } } }
        },
        {
          name: 'tool2',
          description: '',
          inputSchema: undefined
        }
      ];
      client.listTools.mockResolvedValue({ tools: rawTools });
      mockDereference.mockImplementation((schema: any) => Promise.resolve(schema));

      const tools = await mcpClient.getTools();

      expect(tools).toHaveLength(2);
      expect(tools[0]).toEqual({
        name: 'tool1',
        description: 'desc1',
        inputSchema: { type: 'object', properties: { a: { type: 'string' } } }
      });
      expect(tools[1]).toEqual({
        name: 'tool2',
        description: '',
        inputSchema: { type: 'object', properties: {} }
      });
    });

    it('should reject when tools response is not an array', async () => {
      const mcpClient = new MCPClient(config);
      const client = stubConnection(mcpClient);
      client.listTools.mockResolvedValue({ tools: 'not-array' });

      await expect(mcpClient.getTools()).rejects.toThrow('Get tools response is not an array');
    });

    it('should fallback to original schema when dereference fails', async () => {
      const mcpClient = new MCPClient(config);
      const client = stubConnection(mcpClient);

      const rawTools = [
        {
          name: 'tool1',
          description: 'desc',
          inputSchema: { type: 'object', properties: { x: { $ref: '#/bad' } } }
        }
      ];
      client.listTools.mockResolvedValue({ tools: rawTools });
      mockDereference.mockRejectedValue(new Error('dereference failed'));

      const tools = await mcpClient.getTools();

      expect(tools).toHaveLength(1);
      expect(tools[0].inputSchema).toEqual({
        type: 'object',
        properties: { x: { $ref: '#/bad' } }
      });
    });

    it('should resolve internal $ref in definitions', async () => {
      const mcpClient = new MCPClient(config);
      const client = stubConnection(mcpClient);

      const schemaWithRef = {
        type: 'object',
        definitions: {
          Address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' }
            }
          }
        },
        properties: {
          home: { $ref: '#/definitions/Address' }
        }
      };
      client.listTools.mockResolvedValue({
        tools: [{ name: 'refTool', description: 'has ref', inputSchema: schemaWithRef }]
      });

      // Simulate what $RefParser.dereference would return
      const dereferenced = {
        type: 'object',
        definitions: {
          Address: {
            type: 'object',
            properties: { street: { type: 'string' }, city: { type: 'string' } }
          }
        },
        properties: {
          home: {
            type: 'object',
            properties: { street: { type: 'string' }, city: { type: 'string' } }
          }
        }
      };
      mockDereference.mockResolvedValue(dereferenced);

      const tools = await mcpClient.getTools();

      const homeSchema = tools[0].inputSchema.properties!['home'] as any;
      expect(homeSchema).toEqual({
        type: 'object',
        properties: { street: { type: 'string' }, city: { type: 'string' } }
      });
      expect(homeSchema).not.toHaveProperty('$ref');
    });

    it('should resolve nested $ref references', async () => {
      const mcpClient = new MCPClient(config);
      const client = stubConnection(mcpClient);

      const schemaWithNestedRef = {
        type: 'object',
        definitions: {
          Name: {
            type: 'object',
            properties: { first: { type: 'string' }, last: { type: 'string' } }
          },
          Person: {
            type: 'object',
            properties: {
              name: { $ref: '#/definitions/Name' },
              age: { type: 'number' }
            }
          }
        },
        properties: {
          owner: { $ref: '#/definitions/Person' }
        }
      };
      client.listTools.mockResolvedValue({
        tools: [{ name: 'nestedRef', description: 'nested', inputSchema: schemaWithNestedRef }]
      });

      const fullyDereferenced = {
        type: 'object',
        definitions: {
          Name: {
            type: 'object',
            properties: { first: { type: 'string' }, last: { type: 'string' } }
          },
          Person: {
            type: 'object',
            properties: {
              name: {
                type: 'object',
                properties: { first: { type: 'string' }, last: { type: 'string' } }
              },
              age: { type: 'number' }
            }
          }
        },
        properties: {
          owner: {
            type: 'object',
            properties: {
              name: {
                type: 'object',
                properties: { first: { type: 'string' }, last: { type: 'string' } }
              },
              age: { type: 'number' }
            }
          }
        }
      };
      mockDereference.mockResolvedValue(fullyDereferenced);

      const tools = await mcpClient.getTools();

      // Verify nested refs are fully resolved
      const ownerProps = (tools[0].inputSchema.properties!['owner'] as any).properties;
      expect(ownerProps.name.properties).toEqual({
        first: { type: 'string' },
        last: { type: 'string' }
      });
      expect(ownerProps.age).toEqual({ type: 'number' });
    });

    it('should resolve $ref in array items', async () => {
      const mcpClient = new MCPClient(config);
      const client = stubConnection(mcpClient);

      const schemaWithArrayRef = {
        type: 'object',
        definitions: {
          Tag: { type: 'object', properties: { label: { type: 'string' } } }
        },
        properties: {
          tags: { type: 'array', items: { $ref: '#/definitions/Tag' } }
        }
      };
      client.listTools.mockResolvedValue({
        tools: [{ name: 'arrayRef', description: 'array ref', inputSchema: schemaWithArrayRef }]
      });

      mockDereference.mockResolvedValue({
        type: 'object',
        definitions: {
          Tag: { type: 'object', properties: { label: { type: 'string' } } }
        },
        properties: {
          tags: {
            type: 'array',
            items: { type: 'object', properties: { label: { type: 'string' } } }
          }
        }
      });

      const tools = await mcpClient.getTools();

      const tagsSchema = tools[0].inputSchema.properties!['tags'] as any;
      expect(tagsSchema.items).toEqual({
        type: 'object',
        properties: { label: { type: 'string' } }
      });
      expect(tagsSchema.items).not.toHaveProperty('$ref');
    });

    it('should handle tool with no description', async () => {
      const mcpClient = new MCPClient(config);
      const client = stubConnection(mcpClient);
      client.listTools.mockResolvedValue({
        tools: [{ name: 'noDesc', inputSchema: undefined }]
      });

      const tools = await mcpClient.getTools();
      expect(tools[0].description).toBe('');
    });

    it('should close connection in finally block', async () => {
      const mcpClient = new MCPClient(config);
      const client = stubConnection(mcpClient);
      client.listTools.mockResolvedValue({ tools: [] });

      const closeSpy = vi.spyOn(mcpClient, 'closeConnection').mockResolvedValue(undefined);
      await mcpClient.getTools();
      expect(closeSpy).toHaveBeenCalled();
    });

    it('should close connection even on error', async () => {
      const mcpClient = new MCPClient(config);
      const client = stubConnection(mcpClient);
      client.listTools.mockRejectedValue(new Error('list failed'));

      const closeSpy = vi.spyOn(mcpClient, 'closeConnection').mockResolvedValue(undefined);
      await expect(mcpClient.getTools()).rejects.toThrow('list failed');
      expect(closeSpy).toHaveBeenCalled();
    });

    it('should deep clone schema before dereference', async () => {
      const mcpClient = new MCPClient(config);
      const client = stubConnection(mcpClient);

      const originalSchema = {
        type: 'object',
        properties: { a: { type: 'string' } },
        definitions: { Foo: { type: 'number' } }
      };
      client.listTools.mockResolvedValue({
        tools: [{ name: 't', description: 'd', inputSchema: originalSchema }]
      });
      mockDereference.mockImplementation((schema: any) => {
        schema.mutated = true;
        return Promise.resolve(schema);
      });

      await mcpClient.getTools();
      // Original schema should not be mutated
      expect(originalSchema).not.toHaveProperty('mutated');
    });
  });

  describe('toolCall', () => {
    it('should call tool and return result', async () => {
      const mcpClient = new MCPClient(config);
      const client = stubConnection(mcpClient);
      const result = { content: [{ type: 'text', text: 'hello' }] };
      client.callTool.mockResolvedValue(result);

      const res = await mcpClient.toolCall({ toolName: 'myTool', params: { key: 'val' } });

      expect(res).toEqual(result);
      expect(client.callTool).toHaveBeenCalledWith(
        { name: 'myTool', arguments: { key: 'val' } },
        undefined,
        { timeout: 300000 }
      );
    });

    it('should close connection by default', async () => {
      const mcpClient = new MCPClient(config);
      const client = stubConnection(mcpClient);
      client.callTool.mockResolvedValue({ ok: true });

      const closeSpy = vi.spyOn(mcpClient, 'closeConnection').mockResolvedValue(undefined);
      await mcpClient.toolCall({ toolName: 'tool', params: {} });
      expect(closeSpy).toHaveBeenCalled();
    });

    it('should not close connection when closeConnection=false', async () => {
      const mcpClient = new MCPClient(config);
      const client = stubConnection(mcpClient);
      client.callTool.mockResolvedValue({ ok: true });

      const closeSpy = vi.spyOn(mcpClient, 'closeConnection').mockResolvedValue(undefined);
      await mcpClient.toolCall({ toolName: 'tool', params: {}, closeConnection: false });
      expect(closeSpy).not.toHaveBeenCalled();
    });

    it('should reject when tool call fails', async () => {
      const mcpClient = new MCPClient(config);
      const client = stubConnection(mcpClient);
      client.callTool.mockRejectedValue(new Error('tool error'));

      const closeSpy = vi.spyOn(mcpClient, 'closeConnection').mockResolvedValue(undefined);
      await expect(mcpClient.toolCall({ toolName: 'bad', params: {} })).rejects.toThrow(
        'tool error'
      );
      expect(closeSpy).toHaveBeenCalled();
    });
  });

  describe('getConnection', () => {
    it('should fallback to SSE when StreamableHTTP fails', async () => {
      const mcpClient = new MCPClient(config);
      const client = getPrivateClient(mcpClient);
      // First connect (StreamableHTTP) fails, second (SSE) succeeds
      client.connect = vi
        .fn()
        .mockRejectedValueOnce(new Error('streamable failed'))
        .mockResolvedValueOnce(undefined);

      const result = await (mcpClient as any).getConnection();
      expect(client.connect).toHaveBeenCalledTimes(2);
      expect(result).toBe(client);
    });

    it('should reject when both transports fail', async () => {
      const mcpClient = new MCPClient(config);
      const client = getPrivateClient(mcpClient);
      client.connect = vi.fn().mockRejectedValue(new Error('all failed'));

      await expect((mcpClient as any).getConnection()).rejects.toThrow('all failed');
    });

    it('should return client on StreamableHTTP success', async () => {
      const mcpClient = new MCPClient(config);
      const client = getPrivateClient(mcpClient);
      client.connect = vi.fn().mockResolvedValue(undefined);

      const result = await (mcpClient as any).getConnection();
      expect(client.connect).toHaveBeenCalledTimes(1);
      expect(result).toBe(client);
    });
  });
});

describe('getMCPChildren', () => {
  it('should return tool list from new MCP format', async () => {
    const app = {
      _id: 'app123',
      avatar: '/icon.png',
      teamId: 'team1',
      modules: [
        {
          toolConfig: {
            mcpToolSet: {
              toolId: 'tid',
              url: 'http://mcp.test',
              toolList: [
                {
                  name: 'tool_a',
                  description: 'A',
                  inputSchema: { type: 'object', properties: {} }
                },
                {
                  name: 'tool_b',
                  description: 'B',
                  inputSchema: { type: 'object', properties: {} }
                }
              ]
            }
          },
          inputs: [],
          outputs: []
        }
      ]
    } as unknown as AppSchemaType;

    const result = await getMCPChildren(app);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      name: 'tool_a',
      id: 'mcp-app123/tool_a',
      avatar: '/icon.png'
    });
    expect(result[1]).toMatchObject({
      name: 'tool_b',
      id: 'mcp-app123/tool_b',
      avatar: '/icon.png'
    });
  });

  it('should return empty array when new MCP toolList is missing', async () => {
    const app = {
      _id: 'app123',
      avatar: '/icon.png',
      teamId: 'team1',
      modules: [
        {
          toolConfig: {
            mcpToolSet: {
              toolId: 'tid',
              url: 'http://mcp.test',
              toolList: []
            }
          },
          inputs: [],
          outputs: []
        }
      ]
    } as unknown as AppSchemaType;

    const result = await getMCPChildren(app);
    expect(result).toEqual([]);
  });

  it('should query MongoApp for old MCP format', async () => {
    const app = {
      _id: 'app456',
      avatar: '/old-icon.png',
      teamId: 'team2',
      modules: [
        {
          toolConfig: undefined,
          inputs: [],
          outputs: []
        }
      ]
    } as unknown as AppSchemaType;

    const childApps = [
      {
        name: 'child_tool',
        modules: [
          {
            inputs: [
              {
                value: {
                  name: 'child_tool',
                  description: 'child desc',
                  url: 'http://child.mcp',
                  inputSchema: { type: 'object', properties: {} }
                }
              }
            ]
          }
        ]
      }
    ];
    mockMongoAppFind.mockReturnValue({ lean: () => Promise.resolve(childApps) });

    const result = await getMCPChildren(app);

    expect(mockMongoAppFind).toHaveBeenCalledWith({ teamId: 'team2', parentId: 'app456' });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      avatar: '/old-icon.png',
      id: 'mcp-app456/child_tool',
      name: 'child_tool'
    });
  });

  it('should return empty array for old MCP with no children', async () => {
    const app = {
      _id: 'app789',
      avatar: '/icon.png',
      teamId: 'team3',
      modules: [{ toolConfig: undefined, inputs: [], outputs: [] }]
    } as unknown as AppSchemaType;

    mockMongoAppFind.mockReturnValue({ lean: () => Promise.resolve([]) });

    const result = await getMCPChildren(app);
    expect(result).toEqual([]);
  });
});
