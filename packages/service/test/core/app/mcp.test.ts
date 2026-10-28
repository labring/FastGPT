import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import http from 'http';
import os from 'os';
import dns from 'dns/promises';

// --- Hoisted mocks ---
const { mockDereference } = vi.hoisted(() => ({
  mockDereference: vi.fn()
}));

vi.mock('@apidevtools/json-schema-ref-parser', () => ({
  default: {
    dereference: (...args: any[]) => mockDereference(...args)
  }
}));

import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import {
  MCPClient,
  assertMCPUrlNotInternal,
  createMcpSseFetch,
  createMcpSafeFetch,
  getMCPChildren
} from '../../../core/app/mcp';
import type { AppSchemaType } from '@fastgpt/global/core/app/type';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { MongoApp } from '../../../core/app/schema';
import type { AppPublishedWorkflow } from '../../../core/app/version/controller';
import { PRIVATE_URL_TEXT } from '../../../common/system/utils';
import { serviceEnv } from '../../../env';
import { getLogger, LogCategories } from '../../../common/logger';

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

const mutableServiceEnv = serviceEnv as { CHECK_INTERNAL_IP: boolean };
const originalCheckInternalIp = serviceEnv.CHECK_INTERNAL_IP;

afterEach(() => {
  mutableServiceEnv.CHECK_INTERNAL_IP = originalCheckInternalIp;
  vi.unstubAllEnvs();
});

const listen = (handler: http.RequestListener, host = '127.0.0.1') =>
  new Promise<http.Server>((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, host, () => resolve(server));
  });

const closeServer = (server: http.Server) =>
  new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });

const getServerPort = (server: http.Server): number => {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Invalid test server address');
  }
  return address.port;
};

/**
 * 构造一个非 loopback 的本机访问地址,用于模拟“初始 MCP URL 通过 SSRF 校验”。
 * CHECK_INTERNAL_IP=false 时私网地址会放行,但 loopback/metadata 仍然恒拦截。
 */
const getReachablePrivateHost = () => {
  const interfaces = os.networkInterfaces();
  for (const items of Object.values(interfaces)) {
    for (const item of items || []) {
      if (item.family === 'IPv4' && !item.internal) {
        return item.address;
      }
    }
  }
  return undefined;
};

describe('MCPClient', () => {
  const config = { url: 'https://example.com/mcp', headers: { Authorization: 'Bearer test' } };

  describe('assertMCPUrlNotInternal', () => {
    it('should reject localhost MCP endpoints', async () => {
      await expect(assertMCPUrlNotInternal('http://localhost:3000/mcp')).rejects.toBe(
        'Request to private network not allowed'
      );
    });

    it('should allow public MCP endpoints', async () => {
      await expect(assertMCPUrlNotInternal('https://example.com/mcp')).resolves.toBeUndefined();
    });
  });

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

    it('should close the MCP fetch dispatcher with the client', async () => {
      const mcpClient = new MCPClient(config);
      const client = getPrivateClient(mcpClient);
      client.close = vi.fn().mockResolvedValue(undefined);
      client.connect = vi.fn().mockResolvedValue(undefined);

      await (mcpClient as any).getConnection();
      const safeFetch = (mcpClient as any).safeFetch;
      const close = vi.spyOn(safeFetch, 'close');

      await mcpClient.closeConnection();

      expect(close).toHaveBeenCalledOnce();
      expect((mcpClient as any).safeFetch).toBeNull();
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

    it('should not log user config errors', async () => {
      const mcpClient = new MCPClient(config);
      const client = stubConnection(mcpClient);
      const logger = getLogger(LogCategories.MODULE.APP.MCP_TOOLS);
      const errorLog = vi.spyOn(logger, 'error');
      const warnLog = vi.spyOn(logger, 'warn');
      client.listTools.mockRejectedValue(new StreamableHTTPError(401, 'Invalid MCP credentials'));

      await expect(mcpClient.getTools()).rejects.toMatchObject({
        name: 'UserError',
        type: 'config'
      });

      expect(errorLog).not.toHaveBeenCalled();
      expect(warnLog).toHaveBeenCalledWith(
        'MCP client user config error',
        expect.objectContaining({
          operation: 'getTools',
          urlHost: 'example.com',
          errorCode: 401,
          fastgpt: true
        })
      );
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

      expect(tools[0]).toBeDefined();
      const inputSchema = tools[0]!.inputSchema!;
      const homeSchema = inputSchema.properties!['home'] as any;
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
      expect(tools[0]).toBeDefined();
      const inputSchema = tools[0]!.inputSchema!;
      const ownerProps = (inputSchema.properties!['owner'] as any).properties;
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

      expect(tools[0]).toBeDefined();
      const inputSchema = tools[0]!.inputSchema!;
      const tagsSchema = inputSchema.properties!['tags'] as any;
      expect(tagsSchema.items).toEqual({
        type: 'object',
        properties: { label: { type: 'string' } }
      });
      expect(tagsSchema.items).not.toHaveProperty('$ref');
    });

    it('should keep recursive $ref schema JSON-serializable', async () => {
      const mcpClient = new MCPClient(config);
      const client = stubConnection(mcpClient);

      // 递归 $ref：request -> properties -> children -> items -> 回到根
      const recursiveSchema = {
        type: 'object',
        properties: {
          request: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              children: { type: 'array', items: { $ref: '#' } }
            }
          }
        }
      };
      client.listTools.mockResolvedValue({
        tools: [{ name: 'recursive', description: 'recursive ref', inputSchema: recursiveSchema }]
      });

      // 交给真实解析器执行 getTools 传入的选项，验证递归 $ref 不会产出循环引用对象
      const actual = await vi.importActual<typeof import('@apidevtools/json-schema-ref-parser')>(
        '@apidevtools/json-schema-ref-parser'
      );
      mockDereference.mockImplementation((schema, options) =>
        actual.default.dereference(schema, options)
      );

      const tools = await mcpClient.getTools();

      expect(() => JSON.stringify(tools)).not.toThrow();
      expect(tools[0]!.inputSchema!.properties!['request']).toEqual({
        type: 'object',
        properties: {
          name: { type: 'string' },
          children: { type: 'array', items: { $ref: '#' } }
        }
      });
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

    it('should not log user config errors', async () => {
      const mcpClient = new MCPClient(config);
      const client = stubConnection(mcpClient);
      const logger = getLogger(LogCategories.MODULE.APP.MCP_TOOLS);
      const errorLog = vi.spyOn(logger, 'error');
      const warnLog = vi.spyOn(logger, 'warn');
      client.callTool.mockRejectedValue(new StreamableHTTPError(410, 'Url is expired'));

      await expect(mcpClient.toolCall({ toolName: 'bad', params: {} })).rejects.toMatchObject({
        name: 'UserError',
        type: 'config'
      });

      expect(errorLog).not.toHaveBeenCalled();
      expect(warnLog).toHaveBeenCalledWith(
        'MCP client user config error',
        expect.objectContaining({
          operation: 'toolCall',
          errorCode: 410,
          fastgpt: true
        })
      );
    });

    it('classifies 404 after the connection is established as a user config error without error logging', async () => {
      const mcpClient = new MCPClient(config);
      const client = stubConnection(mcpClient);
      const logger = getLogger(LogCategories.MODULE.APP.MCP_TOOLS);
      const errorLog = vi.spyOn(logger, 'error');
      const warnLog = vi.spyOn(logger, 'warn');
      client.callTool.mockRejectedValue(new StreamableHTTPError(404, 'Session not found'));

      await expect(mcpClient.toolCall({ toolName: 'bad', params: {} })).rejects.toMatchObject({
        name: 'UserError',
        type: 'config'
      });

      expect(errorLog).not.toHaveBeenCalled();
      expect(warnLog).toHaveBeenCalledWith(
        'MCP client user config error',
        expect.objectContaining({
          operation: 'toolCall',
          errorCode: 404,
          fastgpt: true
        })
      );
    });

    it('classifies MCP JSON-RPC protocol errors (like -32003 version mismatch) as user config error', async () => {
      const mcpClient = new MCPClient(config);
      const client = stubConnection(mcpClient);
      const logger = getLogger(LogCategories.MODULE.APP.MCP_TOOLS);
      const errorLog = vi.spyOn(logger, 'error');
      const warnLog = vi.spyOn(logger, 'warn');
      const error = Object.assign(new Error('MCP error -32003: 不支持的协议版本[2025-11-25]'), {
        name: 'McpError',
        code: -32003
      });
      client.callTool.mockRejectedValue(error);

      await expect(mcpClient.toolCall({ toolName: 'bad', params: {} })).rejects.toMatchObject({
        name: 'UserError',
        type: 'config'
      });

      expect(errorLog).not.toHaveBeenCalled();
      expect(warnLog).toHaveBeenCalledWith(
        'MCP client user config error',
        expect.objectContaining({
          operation: 'toolCall',
          errorCode: -32003,
          fastgpt: true
        })
      );
    });

    it('treats unexpected internal error without MCP codes as system error without double error logging', async () => {
      const mcpClient = new MCPClient(config);
      const client = stubConnection(mcpClient);
      const logger = getLogger(LogCategories.MODULE.APP.MCP_TOOLS);
      const errorLog = vi.spyOn(logger, 'error');
      const warnLog = vi.spyOn(logger, 'warn');
      const error = new Error('unexpected internal runtime bug');
      client.callTool.mockRejectedValue(error);

      await expect(mcpClient.toolCall({ toolName: 'bad', params: {} })).rejects.toBe(error);

      expect(errorLog).not.toHaveBeenCalled();
      expect(warnLog).toHaveBeenCalledWith(
        'MCP client tool call failed',
        expect.objectContaining({
          urlHost: 'example.com',
          error
        })
      );
    });
  });

  describe('getConnection', () => {
    it('should fallback to SSE when server rejects Streamable HTTP with a 4xx', async () => {
      const mcpClient = new MCPClient(config);
      const client = getPrivateClient(mcpClient);
      const logger = getLogger(LogCategories.MODULE.APP.MCP_TOOLS);
      const errorLog = vi.spyOn(logger, 'error');
      const warnLog = vi.spyOn(logger, 'warn');
      // StreamableHTTP rejected with 405 (server speaks legacy SSE), SSE succeeds
      client.connect = vi
        .fn()
        .mockRejectedValueOnce(new StreamableHTTPError(405, 'Method Not Allowed'))
        .mockResolvedValueOnce(undefined);

      const result = await (mcpClient as any).getConnection();
      expect(client.connect).toHaveBeenCalledTimes(2);
      expect(result).toBe(client);
      expect(errorLog).not.toHaveBeenCalled();
      expect(warnLog).not.toHaveBeenCalled();
    });

    it('should pass custom headers once to the SSE fallback transport', async () => {
      const mcpClient = new MCPClient(config);
      const client = getPrivateClient(mcpClient);
      client.connect = vi
        .fn()
        .mockRejectedValueOnce(new StreamableHTTPError(405, 'Method Not Allowed'))
        .mockResolvedValueOnce(undefined);

      await (mcpClient as any).getConnection();

      const sseTransport = client.connect.mock.calls[1][0] as {
        _requestInit?: RequestInit;
        _eventSourceInit?: EventSourceInit;
      };
      expect(sseTransport._requestInit?.headers).toEqual(config.headers);
      expect(sseTransport._eventSourceInit).toBeUndefined();
    });

    it('should not fallback to SSE on a non-HTTP (e.g. network) error', async () => {
      const mcpClient = new MCPClient(config);
      const client = getPrivateClient(mcpClient);
      client.connect = vi.fn().mockRejectedValue(new Error('network unreachable'));

      await expect((mcpClient as any).getConnection()).rejects.toThrow('network unreachable');
      // Original error surfaces as-is, SSE transport is not attempted
      expect(client.connect).toHaveBeenCalledTimes(1);
    });

    it('should not fallback to SSE when Streamable HTTP fails with a 5xx', async () => {
      const mcpClient = new MCPClient(config);
      const client = getPrivateClient(mcpClient);
      client.connect = vi
        .fn()
        .mockRejectedValue(new StreamableHTTPError(500, 'Internal Server Error'));

      await expect((mcpClient as any).getConnection()).rejects.toThrow('Internal Server Error');
      expect(client.connect).toHaveBeenCalledTimes(1);
    });

    it('should not hide Streamable HTTP 429 behind an SSE probe', async () => {
      const mcpClient = new MCPClient(config);
      const client = getPrivateClient(mcpClient);
      client.connect = vi
        .fn()
        .mockRejectedValueOnce(new StreamableHTTPError(429, 'Too Many Requests'))
        .mockRejectedValueOnce(new StreamableHTTPError(404, 'Not Found'));

      await expect((mcpClient as any).getConnection()).rejects.toMatchObject({ code: 429 });
      expect(client.connect).toHaveBeenCalledTimes(1);
    });

    it('surfaces both errors as user config error when SSE fallback also fails with handshake error', async () => {
      const mcpClient = new MCPClient(config);
      const client = getPrivateClient(mcpClient);
      client.connect = vi
        .fn()
        .mockRejectedValueOnce(new StreamableHTTPError(404, 'Not Found'))
        .mockRejectedValueOnce(new Error('SSE handshake failed'));

      const request = (mcpClient as any).getConnection();

      await expect(request).rejects.toMatchObject({ name: 'UserError', type: 'config' });
      await expect(request).rejects.toThrow(
        /Streamable HTTP:.*Not Found.*SSE:.*SSE handshake failed/s
      );
      expect(client.connect).toHaveBeenCalledTimes(2);
    });

    it('classifies network unreachable SSE failure as a user config error', async () => {
      const mcpClient = new MCPClient(config);
      const client = getPrivateClient(mcpClient);
      client.connect = vi
        .fn()
        .mockRejectedValueOnce(new StreamableHTTPError(410, 'Url is expired'))
        .mockRejectedValueOnce(new Error('SSE network unreachable'));

      await expect((mcpClient as any).getConnection()).rejects.toMatchObject({
        name: 'UserError',
        type: 'config'
      });
      expect(client.connect).toHaveBeenCalledTimes(2);
    });

    it('classifies HTTP 405 Method Not Allowed as a user config error', async () => {
      const mcpClient = new MCPClient(config);
      const client = getPrivateClient(mcpClient);
      client.connect = vi
        .fn()
        .mockRejectedValueOnce(new StreamableHTTPError(405, 'Method Not Allowed'))
        .mockRejectedValueOnce(
          new Error('SSE error: Invalid content type, expected "text/event-stream"')
        );

      await expect((mcpClient as any).getConnection()).rejects.toMatchObject({
        name: 'UserError',
        type: 'config'
      });
      expect(client.connect).toHaveBeenCalledTimes(2);
    });

    it('should classify the final SSE failure as a user config error', async () => {
      const mcpClient = new MCPClient(config);
      const client = getPrivateClient(mcpClient);
      client.connect = vi
        .fn()
        .mockRejectedValueOnce(new StreamableHTTPError(404, 'Not Found'))
        .mockRejectedValueOnce(new StreamableHTTPError(410, 'Url is expired'));

      await expect((mcpClient as any).getConnection()).rejects.toMatchObject({
        name: 'UserError',
        type: 'config'
      });
      expect(client.connect).toHaveBeenCalledTimes(2);
    });

    it.each(['Not Found', 'fetch failed during protocol probe'])(
      'keeps the final internal SSE failure observable after an HTTP probe returns %s',
      async (probeMessage) => {
        const mcpClient = new MCPClient(config);
        const client = getPrivateClient(mcpClient);
        const logger = getLogger(LogCategories.MODULE.APP.MCP_TOOLS);
        const warnLog = vi.spyOn(logger, 'warn');
        const internalError = new TypeError(
          'Cannot read properties of undefined (reading capabilities)'
        );
        client.connect = vi
          .fn()
          .mockRejectedValueOnce(new StreamableHTTPError(404, probeMessage))
          .mockRejectedValueOnce(internalError);

        const request = mcpClient.toolCall({ toolName: 'test', params: {} });
        await expect(request).rejects.toBe(internalError);
        await expect(request).rejects.not.toMatchObject({ name: 'UserError', type: 'config' });
        expect(client.connect).toHaveBeenCalledTimes(2);
        expect(warnLog).toHaveBeenCalledWith(
          'MCP client tool call failed',
          expect.objectContaining({ error: internalError })
        );
        expect(warnLog).not.toHaveBeenCalledWith('MCP client user config error', expect.anything());
      }
    );

    it('should return client on StreamableHTTP success', async () => {
      const mcpClient = new MCPClient(config);
      const client = getPrivateClient(mcpClient);
      client.connect = vi.fn().mockResolvedValue(undefined);

      const result = await (mcpClient as any).getConnection();
      expect(client.connect).toHaveBeenCalledTimes(1);
      expect(result).toBe(client);
    });

    it('should convert ZodError to UserError when MCP server returns invalid JSON-RPC response', async () => {
      const mcpClient = new MCPClient(config);
      const client = getPrivateClient(mcpClient);
      // 模拟 MCP SDK 在收到不合规响应时抛出的 ZodError
      const zodError = new Error('Invalid input: unrecognized_keys: "status", "info", "infocode"');
      zodError.name = 'ZodError';
      client.connect = vi.fn().mockRejectedValue(zodError);

      await expect((mcpClient as any).getConnection()).rejects.toMatchObject({
        name: 'UserError',
        type: 'config',
        message: 'MCP server returned invalid response',
        displayMessage: expect.stringContaining('JSON-RPC 2.0')
      });
      expect(client.connect).toHaveBeenCalledTimes(1);
    });

    it('should convert protocol error in SSE fallback to UserError', async () => {
      const mcpClient = new MCPClient(config);
      const client = getPrivateClient(mcpClient);
      // Streamable HTTP 失败但 fallback 条件满足
      const httpError = new StreamableHTTPError(405, 'Method Not Allowed');
      // SSE fallback 也遇到协议错误
      const zodError = new Error('Invalid input: invalid_union');
      zodError.name = 'ZodError';
      client.connect = vi.fn().mockRejectedValueOnce(httpError).mockRejectedValueOnce(zodError);

      await expect((mcpClient as any).getConnection()).rejects.toMatchObject({
        name: 'UserError',
        type: 'config',
        message: 'MCP server returned invalid response'
      });
      expect(client.connect).toHaveBeenCalledTimes(2);
    });
  });
});

describe('createMcpSseFetch', () => {
  const url = new URL('https://example.com/mcp');

  it.each([401, 403, 404, 410])(
    'preserves SSE GET handshake status %s through the real SDK',
    async (status) => {
      const fetchImpl = vi.fn().mockResolvedValue(
        new Response('expired', {
          status,
          statusText: 'MCP request rejected'
        })
      );
      const transport = new SSEClientTransport(url, {
        fetch: createMcpSseFetch(fetchImpl)
      });

      await expect(transport.start()).rejects.toMatchObject({
        code: status
      });
      await transport.close();
    }
  );

  it.each([401, 403, 410])(
    'preserves SSE POST status %s for MCP error classification',
    async (status) => {
      const fetchImpl = vi.fn().mockResolvedValue(
        new Response('expired', {
          status,
          statusText: 'MCP request rejected'
        })
      );
      const transport = new SSEClientTransport(url, {
        fetch: createMcpSseFetch(fetchImpl)
      });
      (transport as any)._endpoint = url;

      await expect(
        (transport as any).send({
          jsonrpc: '2.0',
          id: 'status-test',
          method: 'ping'
        })
      ).rejects.toMatchObject({
        code: status,
        responseBody: 'expired',
        message: expect.stringContaining('expired')
      });
    }
  );
});

describe('createMcpSafeFetch', () => {
  beforeEach(() => {
    // pnpm may inject npm_config_*_proxy into the test process; isolate direct-connect tests.
    for (const key of [
      'HTTP_PROXY',
      'http_proxy',
      'HTTPS_PROXY',
      'https_proxy',
      'ALL_PROXY',
      'all_proxy',
      'npm_config_http_proxy',
      'npm_config_https_proxy',
      'npm_config_proxy'
    ]) {
      vi.stubEnv(key, '');
    }
  });

  it('should reject a DNS rebinding answer before sending the request', async () => {
    mutableServiceEnv.CHECK_INTERNAL_IP = true;
    vi.spyOn(dns, 'resolve4').mockResolvedValue(['8.8.8.8']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    const fetchImpl = vi.fn();
    const safeFetch = createMcpSafeFetch({ fetchImpl });

    try {
      await expect(safeFetch('http://rebind.example.test/mcp')).rejects.toThrow(PRIVATE_URL_TEXT);
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      await safeFetch.close();
    }
  });

  it('should reject mixed public and private DNS answers', async () => {
    mutableServiceEnv.CHECK_INTERNAL_IP = true;
    vi.spyOn(dns, 'resolve4').mockResolvedValue(['8.8.8.8']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
    vi.spyOn(dns, 'lookup').mockResolvedValue([
      { address: '198.51.100.12', family: 4 },
      { address: '169.254.169.254', family: 4 }
    ]);
    const fetchImpl = vi.fn();
    const safeFetch = createMcpSafeFetch({ fetchImpl });

    try {
      await expect(safeFetch('http://mixed.example.test/mcp')).rejects.toThrow(PRIVATE_URL_TEXT);
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      await safeFetch.close();
    }
  });

  it('should validate the socket address again for every redirect target', async () => {
    mutableServiceEnv.CHECK_INTERNAL_IP = true;
    vi.spyOn(dns, 'resolve4').mockResolvedValue(['8.8.8.8']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
    vi.spyOn(dns, 'lookup')
      .mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }])
      .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('redirect', {
        status: 302,
        headers: { Location: 'http://redirected.example.test/mcp' }
      })
    );
    const safeFetch = createMcpSafeFetch({ fetchImpl });

    try {
      await expect(safeFetch('http://initial.example.test/mcp')).rejects.toThrow(PRIVATE_URL_TEXT);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      await safeFetch.close();
    }
  });

  it('should reject unexpected non-IP lookup results rather than resolving them again', async () => {
    vi.spyOn(dns, 'resolve4').mockResolvedValue(['8.8.8.8']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: 'unexpected.example.test', family: 4 }]);
    const fetchImpl = vi.fn();
    const safeFetch = createMcpSafeFetch({ fetchImpl });

    try {
      await expect(safeFetch('http://invalid.example.test/mcp')).rejects.toThrow(
        'DNS lookup returned an invalid address'
      );
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      await safeFetch.close();
    }
  });

  it('should connect using the validated IP without another DNS lookup', async () => {
    mutableServiceEnv.CHECK_INTERNAL_IP = false;
    const carrierHost = getReachablePrivateHost();
    if (!carrierHost) return;

    vi.spyOn(dns, 'resolve4').mockResolvedValue(['8.8.8.8']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
    const lookup = vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: carrierHost, family: 4 }]);
    const server = await listen((req, res) => res.end(req.headers.host), '0.0.0.0');
    const safeFetch = createMcpSafeFetch();
    const hostname = 'pinned.example.test';

    try {
      const response = await safeFetch(`http://${hostname}:${getServerPort(server)}/mcp`);
      expect(await response.text()).toBe(`${hostname}:${getServerPort(server)}`);
      expect(lookup).toHaveBeenCalledTimes(1);
    } finally {
      await safeFetch.close();
      await closeServer(server);
    }
  });

  it('should fail closed when an HTTP proxy would resolve the target', async () => {
    vi.stubEnv('HTTP_PROXY', 'http://127.0.0.1:3128');
    vi.stubEnv('NO_PROXY', '');
    vi.spyOn(dns, 'resolve4').mockResolvedValue(['198.51.100.12']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
    const fetchImpl = vi.fn();
    const safeFetch = createMcpSafeFetch({ fetchImpl });

    try {
      await expect(safeFetch('http://proxy.example.test/mcp')).rejects.toThrow(
        'MCP requests through an HTTP proxy are not supported by SSRF protection'
      );
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      await safeFetch.close();
    }
  });

  it('should follow safe redirects hop by hop', async () => {
    mutableServiceEnv.CHECK_INTERNAL_IP = false;
    const carrierHost = getReachablePrivateHost();
    if (!carrierHost) {
      return;
    }

    const targetServer = await listen((req, res) => {
      res.end(JSON.stringify({ ok: true, url: req.url }));
    }, '0.0.0.0');
    const targetPort = getServerPort(targetServer);

    const redirectServer = await listen((req, res) => {
      res.statusCode = 302;
      res.setHeader('Location', `http://${carrierHost}:${targetPort}/mcp-target`);
      res.end('redirect');
    }, '0.0.0.0');
    const redirectPort = getServerPort(redirectServer);

    try {
      const response = await createMcpSafeFetch()(`http://${carrierHost}:${redirectPort}/mcp`);

      expect(await response.json()).toEqual({ ok: true, url: '/mcp-target' });
    } finally {
      await closeServer(redirectServer);
      await closeServer(targetServer);
    }
  });

  it('should block redirects to loopback addresses', async () => {
    mutableServiceEnv.CHECK_INTERNAL_IP = false;
    const carrierHost = getReachablePrivateHost();
    if (!carrierHost) {
      return;
    }

    const protectedServer = await listen((req, res) => {
      res.end('INTERNAL-ONLY-RESPONSE');
    });
    const protectedPort = getServerPort(protectedServer);

    const redirectServer = await listen((req, res) => {
      res.statusCode = 302;
      res.setHeader('Location', `http://127.0.0.1:${protectedPort}/mcp`);
      res.end('redirect');
    }, '0.0.0.0');
    const redirectPort = getServerPort(redirectServer);

    try {
      await expect(createMcpSafeFetch()(`http://${carrierHost}:${redirectPort}/mcp`)).rejects.toBe(
        PRIVATE_URL_TEXT
      );
    } finally {
      await closeServer(redirectServer);
      await closeServer(protectedServer);
    }
  });

  it('should enforce max redirect count', async () => {
    mutableServiceEnv.CHECK_INTERNAL_IP = false;
    const carrierHost = getReachablePrivateHost();
    if (!carrierHost) {
      return;
    }

    let redirectPort = 0;
    const redirectServer = await listen((req, res) => {
      res.statusCode = 302;
      res.setHeader('Location', `http://${carrierHost}:${redirectPort}/loop`);
      res.end('redirect');
    }, '0.0.0.0');
    redirectPort = getServerPort(redirectServer);

    try {
      await expect(
        createMcpSafeFetch({ maxRedirects: 1 })(`http://${carrierHost}:${redirectPort}/loop`)
      ).rejects.toThrow('Maximum MCP redirects exceeded');
    } finally {
      await closeServer(redirectServer);
    }
  });

  it('should drop sensitive headers when redirect target changes', async () => {
    mutableServiceEnv.CHECK_INTERNAL_IP = false;
    const carrierHost = getReachablePrivateHost();
    if (!carrierHost) {
      return;
    }

    let receivedAuthorization: string | undefined;
    let receivedCookie: string | undefined;
    const targetServer = await listen((req, res) => {
      receivedAuthorization = req.headers.authorization;
      receivedCookie = req.headers.cookie;
      res.end('ok');
    }, '0.0.0.0');
    const targetPort = getServerPort(targetServer);

    const redirectServer = await listen((req, res) => {
      res.statusCode = 302;
      res.setHeader('Location', `http://${carrierHost}:${targetPort}/mcp-target`);
      res.end('redirect');
    }, '0.0.0.0');
    const redirectPort = getServerPort(redirectServer);

    try {
      const response = await createMcpSafeFetch()(`http://${carrierHost}:${redirectPort}/mcp`, {
        headers: {
          Authorization: 'Bearer secret',
          Cookie: 'token=secret'
        }
      });

      expect(await response.text()).toBe('ok');
      expect(receivedAuthorization).toBeUndefined();
      expect(receivedCookie).toBeUndefined();
    } finally {
      await closeServer(redirectServer);
      await closeServer(targetServer);
    }
  });
});

describe('getMCPChildren', () => {
  const createMcpWorkflow = (
    toolConfig?: NonNullable<AppPublishedWorkflow['nodes'][number]['toolConfig']>
  ): AppPublishedWorkflow => ({
    nodes: [
      {
        nodeId: 'mcp-toolset',
        flowNodeType: FlowNodeTypeEnum.toolSet,
        name: 'MCP toolset',
        toolConfig,
        inputs: [],
        outputs: []
      }
    ]
  });

  it('should return tool list from new MCP format', async () => {
    const app = {
      _id: 'app123',
      avatar: '/icon.png',
      teamId: 'team1',
      type: AppTypeEnum.mcpToolSet
    } as AppSchemaType;
    const workflow = createMcpWorkflow({
      mcpToolSet: {
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
    });

    const result = await getMCPChildren(app, workflow);

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
      type: AppTypeEnum.mcpToolSet
    } as AppSchemaType;
    const workflow = createMcpWorkflow({
      mcpToolSet: {
        url: 'http://mcp.test',
        toolList: []
      }
    });

    const result = await getMCPChildren(app, workflow);
    expect(result).toEqual([]);
  });

  it('should query MongoApp for legacy MCP format when parent has no inline toolSet', async () => {
    const parentId = '65f000000000000000000081';
    const teamId = '65f000000000000000000082';
    const app = {
      _id: parentId,
      avatar: '/legacy-icon.png',
      teamId,
      type: AppTypeEnum.mcpToolSet,
      modules: [{ inputs: [], outputs: [] }]
    } as unknown as AppSchemaType;

    const childApps = [
      {
        name: 'child_tool_1',
        intro: 'Child Tool 1 Intro',
        modules: [
          {
            inputs: [
              {
                value: {
                  name: 'child_tool_1',
                  description: 'Desc 1',
                  url: 'http://child1.mcp',
                  headerSecret: { Authorization: { value: 'tok-1' } },
                  inputSchema: { type: 'object', properties: { q: { type: 'string' } } }
                }
              }
            ]
          }
        ]
      },
      {
        name: 'child_tool_2',
        intro: 'Child Tool 2 Intro',
        modules: [
          {
            inputs: [
              {
                value: {
                  name: 'child_tool_2',
                  description: 'Desc 2',
                  url: 'http://child1.mcp',
                  headerSecret: { value: 'single-legacy-token' },
                  inputSchema: { type: 'object', properties: {} }
                }
              }
            ]
          }
        ]
      },
      {
        name: 'child_tool_3',
        modules: [
          {
            inputs: [
              {
                value: {
                  name: 'child_tool_3',
                  url: 'http://child1.mcp',
                  headerSecret: { Authorization: { value: '', secret: 'encrypted-map-token' } },
                  inputSchema: { type: 'object', properties: {} }
                }
              }
            ]
          }
        ]
      },
      {
        name: 'child_tool_4',
        modules: [
          {
            inputs: [
              {
                value: {
                  name: 'child_tool_4',
                  url: 'http://child1.mcp',
                  headerSecret: { value: '', secret: 'encrypted-single-token' },
                  inputSchema: { type: 'object', properties: {} }
                }
              }
            ]
          }
        ]
      }
    ];

    const findSpy = vi.spyOn(MongoApp, 'find').mockReturnValue({
      lean: () => Promise.resolve(childApps)
    } as any);

    const result = await getMCPChildren(app);

    expect(findSpy).toHaveBeenCalledWith({
      teamId,
      parentId
    });
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({
      name: 'child_tool_1',
      description: 'Desc 1',
      id: `mcp-${parentId}/child_tool_1`,
      avatar: '/legacy-icon.png',
      url: 'http://child1.mcp',
      headerSecret: { Authorization: { value: 'tok-1' } },
      inputSchema: { type: 'object', properties: { q: { type: 'string' } } }
    });
    expect(result[1]).toEqual({
      name: 'child_tool_2',
      description: 'Desc 2',
      id: `mcp-${parentId}/child_tool_2`,
      avatar: '/legacy-icon.png',
      url: 'http://child1.mcp',
      headerSecret: { Authorization: { value: 'single-legacy-token' } },
      inputSchema: { type: 'object', properties: {} }
    });
    expect(result[2].headerSecret).toEqual({
      Authorization: { secret: 'encrypted-map-token' }
    });
    expect(result[3].headerSecret).toEqual({
      Authorization: { secret: 'encrypted-single-token' }
    });
  });

  it('should return empty array for legacy MCP with no children in MongoApp', async () => {
    const parentId = '65f000000000000000000083';
    const teamId = '65f000000000000000000084';
    const app = {
      _id: parentId,
      avatar: '/icon.png',
      teamId,
      type: AppTypeEnum.mcpToolSet,
      modules: [{ inputs: [], outputs: [] }]
    } as unknown as AppSchemaType;

    vi.spyOn(MongoApp, 'find').mockReturnValue({
      lean: () => Promise.resolve([])
    } as any);

    const result = await getMCPChildren(app);
    expect(result).toEqual([]);
  });
});
