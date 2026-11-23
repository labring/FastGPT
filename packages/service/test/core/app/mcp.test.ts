import { getTestInstanceConfig } from '@test/utils/instanceConfigSnapshot';
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import http from 'http';
import net from 'net';
import os from 'os';
import tls from 'tls';
import dns from 'dns/promises';
import { Agent, Pool, ProxyAgent, fetch as undiciFetch } from 'undici';

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

const originalCheckInternalIp = getTestInstanceConfig().security.checkInternalIp;

afterEach(() => {
  getTestInstanceConfig().security.checkInternalIp = originalCheckInternalIp;
  vi.unstubAllEnvs();
});

const listen = (handler: http.RequestListener, host = '127.0.0.1') =>
  new Promise<http.Server>((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, host, () => resolve(server));
  });

const closeServer = (server: http.Server) =>
  new Promise<void>((resolve, reject) => {
    server.closeAllConnections?.();
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

    it('preserves configuration errors for the centralized logger', async () => {
      const mcpClient = new MCPClient(config);
      const client = stubConnection(mcpClient);
      const logger = getLogger(LogCategories.MODULE.APP.MCP_TOOLS);
      const errorLog = vi.spyOn(logger, 'error');
      const warnLog = vi.spyOn(logger, 'warn');
      client.listTools.mockRejectedValue(new StreamableHTTPError(401, 'Invalid MCP credentials'));

      await expect(mcpClient.getTools()).rejects.toMatchObject({
        name: 'UserConfigError'
      });

      expect(errorLog).not.toHaveBeenCalled();
      expect(warnLog).toHaveBeenCalledWith(
        'MCP client failed to get tools',
        expect.objectContaining({
          urlHost: 'example.com',
          error: expect.objectContaining({
            name: 'UserConfigError',
            cause: expect.objectContaining({ code: 401 })
          })
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

    it.each([
      { code: 410, message: 'Url is expired', protocol: false },
      { code: 404, message: 'Session not found', protocol: false },
      { code: -32003, message: 'MCP error -32003: unsupported protocol version', protocol: true }
    ])(
      'preserves external failure $code for centralized log classification',
      async ({ code, message, protocol }) => {
        const mcpClient = new MCPClient(config);
        const client = stubConnection(mcpClient);
        const logger = getLogger(LogCategories.MODULE.APP.MCP_TOOLS);
        const errorLog = vi.spyOn(logger, 'error');
        const warnLog = vi.spyOn(logger, 'warn');
        const error = protocol
          ? Object.assign(new Error(message), { name: 'McpError', code })
          : new StreamableHTTPError(code, message);
        client.callTool.mockRejectedValue(error);

        await expect(mcpClient.toolCall({ toolName: 'bad', params: {} })).rejects.toMatchObject({
          name: 'UserConfigError',
          cause: error
        });
        expect(errorLog).not.toHaveBeenCalled();
        expect(warnLog).toHaveBeenCalledWith(
          'MCP client tool call failed',
          expect.objectContaining({
            error: expect.objectContaining({ name: 'UserConfigError', cause: error })
          })
        );
      }
    );

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

    it.each([
      {
        kind: 'external server',
        error: new StreamableHTTPError(500, 'Internal Server Error'),
        external: true
      },
      { kind: 'internal', error: new TypeError('Internal connection failure'), external: false }
    ])(
      'keeps $kind connection diagnostics without attempting SSE fallback',
      async ({ error, external }) => {
        const mcpClient = new MCPClient(config);
        const client = getPrivateClient(mcpClient);
        const infoLog = vi.spyOn(getLogger(LogCategories.MODULE.APP.MCP_TOOLS), 'info');
        client.connect = vi.fn().mockRejectedValue(error);

        await expect((mcpClient as any).getConnection()).rejects.toBe(error);
        expect(client.connect).toHaveBeenCalledTimes(1);
        expect(infoLog).toHaveBeenCalledWith('Streamable HTTP error', {
          error,
          ...(external ? { otel: false } : {})
        });
      }
    );

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

      await expect(request).rejects.toMatchObject({ name: 'UserConfigError' });
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
        name: 'UserConfigError'
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
        name: 'UserConfigError'
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
        name: 'UserConfigError'
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
        await expect(request).rejects.not.toMatchObject({ name: 'UserConfigError' });
        expect(client.connect).toHaveBeenCalledTimes(2);
        expect(warnLog).toHaveBeenCalledWith(
          'MCP client tool call failed',
          expect.objectContaining({ error: internalError })
        );
      }
    );

    it.each([
      { code: 'EMFILE', external: false },
      { code: 'ECONNREFUSED', external: true },
      { code: 'ENOTFOUND', external: true },
      { code: undefined, external: false },
      { code: 'EMFILE', outerCode: 'UND_ERR_SOCKET', external: false }
    ])(
      'classifies fetch cause $code under wrapper $outerCode',
      async ({ code, outerCode, external }) => {
        // 使用真实 fetch 包装连接器异常，验证通用 TypeError 文案不会覆盖结构化原因。
        const rootCause = Object.assign(new Error(code ?? 'unknown local failure'), { code });
        const dispatcher = new Agent({
          connect: (_options, callback) => callback(rootCause, null)
        });
        const fetchError = await undiciFetch('http://example.com/mcp', { dispatcher }).catch(
          (error: unknown) => error
        );
        await dispatcher.close();
        expect(fetchError).toBeInstanceOf(TypeError);
        expect(fetchError).toMatchObject({ message: 'fetch failed', cause: rootCause });
        const error = outerCode
          ? Object.assign(new Error('network unreachable', { cause: fetchError }), {
              code: outerCode
            })
          : fetchError;

        const mcpClient = new MCPClient(config);
        const client = getPrivateClient(mcpClient);
        const logger = getLogger(LogCategories.MODULE.APP.MCP_TOOLS);
        const warnLog = vi.spyOn(logger, 'warn');
        const infoLog = vi.spyOn(logger, 'info');
        client.connect = vi.fn().mockRejectedValue(error);

        const request = mcpClient.toolCall({ toolName: 'test', params: {} });
        if (external) {
          await expect(request).rejects.toMatchObject({ name: 'UserConfigError', cause: error });
        } else {
          await expect(request).rejects.toBe(error);
        }
        expect(warnLog).toHaveBeenCalledWith(
          'MCP client tool call failed',
          expect.objectContaining({
            error: external
              ? expect.objectContaining({ name: 'UserConfigError', cause: error })
              : error
          })
        );
        expect(infoLog).toHaveBeenCalledWith('Streamable HTTP error', {
          error,
          ...(external ? { otel: false } : {})
        });
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

    it('should convert ZodError to UserConfigError when MCP server returns invalid JSON-RPC response', async () => {
      const mcpClient = new MCPClient(config);
      const client = getPrivateClient(mcpClient);
      // 模拟 MCP SDK 在收到不合规响应时抛出的 ZodError
      const zodError = new Error('Invalid input: unrecognized_keys: "status", "info", "infocode"');
      zodError.name = 'ZodError';
      client.connect = vi.fn().mockRejectedValue(zodError);

      await expect((mcpClient as any).getConnection()).rejects.toMatchObject({
        name: 'UserConfigError',
        message: 'MCP server returned invalid response',
        displayMessage: expect.stringContaining('JSON-RPC 2.0'),
        cause: zodError
      });
      expect(client.connect).toHaveBeenCalledTimes(1);
    });

    it('should convert protocol error in SSE fallback to UserConfigError', async () => {
      const mcpClient = new MCPClient(config);
      const client = getPrivateClient(mcpClient);
      // Streamable HTTP 失败但 fallback 条件满足
      const httpError = new StreamableHTTPError(405, 'Method Not Allowed');
      // SSE fallback 也遇到协议错误
      const zodError = new Error('Invalid input: invalid_union');
      zodError.name = 'ZodError';
      client.connect = vi.fn().mockRejectedValueOnce(httpError).mockRejectedValueOnce(zodError);

      await expect((mcpClient as any).getConnection()).rejects.toMatchObject({
        name: 'UserConfigError',
        message: 'MCP server returned invalid response',
        cause: zodError
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
    getTestInstanceConfig().security.checkInternalIp = true;
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
    getTestInstanceConfig().security.checkInternalIp = true;
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
    getTestInstanceConfig().security.checkInternalIp = true;
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
    getTestInstanceConfig().security.checkInternalIp = false;
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

  const startConnectProxy = async (
    targetPort: number,
    options: { statusCode?: number; statusText?: string } = {}
  ) => {
    let connectedTarget: string | undefined;
    let connectHostHeader: string | undefined;
    let proxyAuthorization: string | undefined;
    let connectCount = 0;
    const tunnelSockets = new Set<net.Socket>();
    const proxyServer = await listen((_req, res) => {
      res.statusCode = 405;
      res.end();
    });
    proxyServer.on('connect', (req, clientSocket, head) => {
      connectCount += 1;
      connectedTarget = req.url;
      connectHostHeader = req.headers.host;
      proxyAuthorization = req.headers['proxy-authorization'];
      tunnelSockets.add(clientSocket);

      if (options.statusCode && options.statusCode !== 200) {
        clientSocket.end(
          `HTTP/1.1 ${options.statusCode} ${options.statusText || 'Proxy Error'}\r\n\r\n`
        );
        return;
      }

      const upstreamSocket = net.connect(targetPort, '127.0.0.1', () => {
        tunnelSockets.add(upstreamSocket);
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length > 0) upstreamSocket.write(head);
        upstreamSocket.pipe(clientSocket);
        clientSocket.pipe(upstreamSocket);
      });
      upstreamSocket.on('error', () => clientSocket.destroy());
      clientSocket.on('close', () => {
        tunnelSockets.delete(clientSocket);
        tunnelSockets.delete(upstreamSocket);
        upstreamSocket.destroy();
      });
    });

    return {
      port: getServerPort(proxyServer),
      getConnectedTarget: () => connectedTarget,
      getConnectHostHeader: () => connectHostHeader,
      getProxyAuthorization: () => proxyAuthorization,
      getConnectCount: () => connectCount,
      close: async () => {
        for (const socket of tunnelSockets) socket.destroy();
        await closeServer(proxyServer);
      }
    };
  };

  it('should CONNECT with the validated IP and preserve Host when an HTTP proxy is configured', async () => {
    vi.spyOn(dns, 'resolve4').mockResolvedValue(['198.51.100.12']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
    const lookup = vi
      .spyOn(dns, 'lookup')
      .mockResolvedValue([{ address: '198.51.100.12', family: 4 }]);
    const targetServer = await listen((req, res) => {
      res.end(JSON.stringify({ ok: true, host: req.headers.host, url: req.url }));
    });
    const proxy = await startConnectProxy(getServerPort(targetServer));
    const safeFetch = createMcpSafeFetch();

    try {
      vi.stubEnv('HTTP_PROXY', `http://127.0.0.1:${proxy.port}`);
      vi.stubEnv('NO_PROXY', '');
      vi.stubEnv('no_proxy', '');

      const response = await safeFetch('http://proxy.example.test/mcp');
      expect(await response.json()).toEqual({
        ok: true,
        host: 'proxy.example.test',
        url: '/mcp'
      });
      expect(proxy.getConnectedTarget()).toBe('198.51.100.12:80');
      expect(proxy.getConnectHostHeader()).toBe('198.51.100.12:80');
      expect(lookup).toHaveBeenCalledTimes(1);
    } finally {
      await safeFetch.close();
      await Promise.all([proxy.close(), closeServer(targetServer)]);
    }
  });

  it('should block DNS rebinding to loopback or private 10.x network before contacting the HTTP proxy', async () => {
    getTestInstanceConfig().security.checkInternalIp = true;
    vi.spyOn(dns, 'resolve4').mockResolvedValue(['8.8.8.8']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
    vi.spyOn(dns, 'lookup')
      .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }])
      .mockResolvedValueOnce([{ address: '10.0.0.8', family: 4 }]);
    const targetServer = await listen((_req, res) => res.end('should-not-reach'));
    const proxy = await startConnectProxy(getServerPort(targetServer));
    const safeFetch = createMcpSafeFetch();

    try {
      vi.stubEnv('HTTP_PROXY', `http://127.0.0.1:${proxy.port}`);
      vi.stubEnv('NO_PROXY', '');
      vi.stubEnv('no_proxy', '');

      await expect(safeFetch('http://rebind.example.test/mcp')).rejects.toThrow(PRIVATE_URL_TEXT);
      await expect(safeFetch('http://rebind-private.example.test/mcp')).rejects.toThrow(
        PRIVATE_URL_TEXT
      );
      expect(proxy.getConnectCount()).toBe(0);
    } finally {
      await safeFetch.close();
      await Promise.all([proxy.close(), closeServer(targetServer)]);
    }
  });

  it('should reject when DNS lookup fails before contacting the HTTP proxy', async () => {
    getTestInstanceConfig().security.checkInternalIp = true;
    vi.spyOn(dns, 'resolve4').mockResolvedValue(['8.8.8.8']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
    vi.spyOn(dns, 'lookup').mockRejectedValue(
      Object.assign(new Error('getaddrinfo ENOTFOUND missing.example.test'), { code: 'ENOTFOUND' })
    );
    const targetServer = await listen((_req, res) => res.end('should-not-reach'));
    const proxy = await startConnectProxy(getServerPort(targetServer));
    const safeFetch = createMcpSafeFetch();

    try {
      vi.stubEnv('HTTP_PROXY', `http://127.0.0.1:${proxy.port}`);
      vi.stubEnv('NO_PROXY', '');
      vi.stubEnv('no_proxy', '');

      await expect(safeFetch('http://missing.example.test/mcp')).rejects.toThrow('ENOTFOUND');
      expect(proxy.getConnectCount()).toBe(0);
    } finally {
      await safeFetch.close();
      await Promise.all([proxy.close(), closeServer(targetServer)]);
    }
  });

  it('should bracket IPv6 targets in proxy CONNECT authority while preserving Host', async () => {
    vi.spyOn(dns, 'resolve4').mockResolvedValue([]);
    vi.spyOn(dns, 'resolve6').mockResolvedValue(['2001:db8::1']);
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '2001:db8::1', family: 6 }]);
    const targetServer = await listen((req, res) => {
      res.end(JSON.stringify({ host: req.headers.host }));
    });
    const proxy = await startConnectProxy(getServerPort(targetServer));
    const safeFetch = createMcpSafeFetch();

    try {
      vi.stubEnv('HTTP_PROXY', `http://127.0.0.1:${proxy.port}`);
      vi.stubEnv('NO_PROXY', '');
      vi.stubEnv('no_proxy', '');

      const response = await safeFetch('http://ipv6.example.test/mcp');
      expect(await response.json()).toEqual({ host: 'ipv6.example.test' });
      expect(proxy.getConnectedTarget()).toBe('[2001:db8::1]:80');
      expect(proxy.getConnectHostHeader()).toBe('[2001:db8::1]:80');
    } finally {
      await safeFetch.close();
      await Promise.all([proxy.close(), closeServer(targetServer)]);
    }
  });

  it('should forward Proxy-Authorization from proxy URL credentials', async () => {
    vi.spyOn(dns, 'resolve4').mockResolvedValue(['198.51.100.12']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '198.51.100.12', family: 4 }]);
    const targetServer = await listen((_req, res) => res.end('ok'));
    const proxy = await startConnectProxy(getServerPort(targetServer));
    const safeFetch = createMcpSafeFetch();

    try {
      vi.stubEnv('HTTP_PROXY', `http://proxy%40user:s3cr%3Aet@127.0.0.1:${proxy.port}`);
      vi.stubEnv('NO_PROXY', '');
      vi.stubEnv('no_proxy', '');

      const response = await safeFetch('http://auth-proxy.example.test/mcp');
      expect(await response.text()).toBe('ok');
      expect(proxy.getProxyAuthorization()).toBe(
        `Basic ${Buffer.from('proxy@user:s3cr:et').toString('base64')}`
      );
      expect(proxy.getConnectedTarget()).toBe('198.51.100.12:80');
    } finally {
      await safeFetch.close();
      await Promise.all([proxy.close(), closeServer(targetServer)]);
    }
  });

  it('should keep original TLS servername (SNI) for HTTPS over proxy CONNECT', async () => {
    vi.spyOn(dns, 'resolve4').mockResolvedValue(['198.51.100.12']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '198.51.100.12', family: 4 }]);

    let receivedServername: string | undefined;
    const tlsServer = tls.createServer({
      SNICallback: (servername, cb) => {
        receivedServername = servername;
        cb(new Error('sni-captured'));
      }
    });
    await new Promise<void>((resolve) => tlsServer.listen(0, '127.0.0.1', resolve));
    const tlsAddress = tlsServer.address();
    if (!tlsAddress || typeof tlsAddress === 'string') {
      throw new Error('Invalid TLS server address');
    }

    const proxy = await startConnectProxy(tlsAddress.port);
    const safeFetch = createMcpSafeFetch();

    try {
      vi.stubEnv('HTTPS_PROXY', `http://127.0.0.1:${proxy.port}`);
      vi.stubEnv('NO_PROXY', '');
      vi.stubEnv('no_proxy', '');

      await expect(safeFetch('https://sni.example.test/mcp')).rejects.toThrow();
      expect(proxy.getConnectedTarget()).toBe('198.51.100.12:443');
      expect(receivedServername).toBe('sni.example.test');
    } finally {
      await safeFetch.close();
      await proxy.close();
      await new Promise<void>((resolve) => tlsServer.close(() => resolve()));
    }
  });

  it('should omit TLS SNI for IP-literal HTTPS targets over proxy CONNECT', async () => {
    let receivedServername: string | undefined;
    const tlsServer = tls.createServer({
      SNICallback: (servername, cb) => {
        receivedServername = servername;
        cb(new Error('ip-sni-captured'));
      }
    });
    await new Promise<void>((resolve) => tlsServer.listen(0, '127.0.0.1', resolve));
    const tlsAddress = tlsServer.address();
    if (!tlsAddress || typeof tlsAddress === 'string') {
      throw new Error('Invalid TLS server address');
    }

    const proxy = await startConnectProxy(tlsAddress.port);
    const safeFetch = createMcpSafeFetch();

    try {
      vi.stubEnv('HTTPS_PROXY', `http://127.0.0.1:${proxy.port}`);
      vi.stubEnv('NO_PROXY', '');
      vi.stubEnv('no_proxy', '');

      await expect(safeFetch('https://198.51.100.12/mcp')).rejects.toThrow();
      expect(proxy.getConnectedTarget()).toBe('198.51.100.12:443');
      expect(receivedServername).toBeUndefined();
    } finally {
      await safeFetch.close();
      await proxy.close();
      await new Promise<void>((resolve) => tlsServer.close(() => resolve()));
    }
  });

  it('should surface an error when the HTTP proxy returns a non-200 CONNECT status', async () => {
    vi.spyOn(dns, 'resolve4').mockResolvedValue(['198.51.100.12']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '198.51.100.12', family: 4 }]);
    const proxy = await startConnectProxy(0, { statusCode: 403, statusText: 'Forbidden' });
    const safeFetch = createMcpSafeFetch();

    try {
      vi.stubEnv('HTTP_PROXY', `http://127.0.0.1:${proxy.port}`);
      vi.stubEnv('NO_PROXY', '');
      vi.stubEnv('no_proxy', '');

      await expect(safeFetch('http://blocked.example.test/mcp')).rejects.toMatchObject({
        code: 'MCP_PROXY_TUNNEL_ERROR',
        statusCode: 403,
        message: 'Proxy response (403) !== 200 when HTTP Tunneling'
      });
    } finally {
      await safeFetch.close();
      await proxy.close();
    }
  });

  it('should classify proxy CONNECT non-200 rejection as UserConfigError without otel alerting in MCPClient', async () => {
    vi.spyOn(dns, 'resolve4').mockResolvedValue(['198.51.100.12']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '198.51.100.12', family: 4 }]);
    const proxy = await startConnectProxy(0, { statusCode: 403, statusText: 'Forbidden' });
    const logger = getLogger(LogCategories.MODULE.APP.MCP_TOOLS);
    const infoLog = vi.spyOn(logger, 'info');

    try {
      vi.stubEnv('HTTP_PROXY', `http://127.0.0.1:${proxy.port}`);
      vi.stubEnv('NO_PROXY', '');
      vi.stubEnv('no_proxy', '');

      const mcpClient = new MCPClient({
        url: 'http://blocked.example.test/mcp',
        headers: {}
      });

      await expect(mcpClient.getTools()).rejects.toMatchObject({
        name: 'UserConfigError',
        cause: expect.objectContaining({
          code: 'MCP_PROXY_TUNNEL_ERROR',
          statusCode: 403
        })
      });
      expect(infoLog).toHaveBeenCalledWith(
        'Streamable HTTP error',
        expect.objectContaining({
          otel: false,
          error: expect.objectContaining({
            code: 'MCP_PROXY_TUNNEL_ERROR'
          })
        })
      );
    } finally {
      await proxy.close();
    }
  });

  it('should classify proxy CONNECT 407 Proxy Authentication Required as UserConfigError in MCPClient', async () => {
    vi.spyOn(dns, 'resolve4').mockResolvedValue(['198.51.100.12']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '198.51.100.12', family: 4 }]);
    const proxy = await startConnectProxy(0, {
      statusCode: 407,
      statusText: 'Proxy Authentication Required'
    });

    try {
      vi.stubEnv('HTTP_PROXY', `http://127.0.0.1:${proxy.port}`);
      vi.stubEnv('NO_PROXY', '');
      vi.stubEnv('no_proxy', '');

      const mcpClient = new MCPClient({
        url: 'http://auth-required.example.test/mcp',
        headers: {}
      });

      await expect(mcpClient.getTools()).rejects.toMatchObject({
        name: 'UserConfigError',
        cause: expect.objectContaining({
          code: 'MCP_PROXY_TUNNEL_ERROR',
          statusCode: 407
        })
      });
    } finally {
      await proxy.close();
    }
  });

  it('should wrap proxy TLS altname errors as SecureProxyConnectionError without retry loop on HTTP targets', async () => {
    vi.spyOn(dns, 'resolve4').mockResolvedValue(['198.51.100.12']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '198.51.100.12', family: 4 }]);
    const altnameError = Object.assign(new Error('Hostname/IP does not match proxy certificate'), {
      code: 'ERR_TLS_CERT_ALTNAME_INVALID'
    });
    const poolConnectSpy = vi.spyOn(Pool.prototype, 'connect').mockRejectedValue(altnameError);
    const safeFetch = createMcpSafeFetch();

    try {
      vi.stubEnv('HTTP_PROXY', 'https://proxy.example.test:3128');
      vi.stubEnv('NO_PROXY', '');
      vi.stubEnv('no_proxy', '');

      await expect(safeFetch('http://target.example.test/mcp')).rejects.toMatchObject({
        name: 'SecureProxyConnectionError',
        code: 'UND_ERR_PRX_TLS',
        cause: altnameError
      });
      expect(poolConnectSpy).toHaveBeenCalledTimes(1);
    } finally {
      await safeFetch.close();
    }
  });

  it('should cancel a pending proxy CONNECT when caller AbortSignal aborts and close cleanly', async () => {
    vi.spyOn(dns, 'resolve4').mockResolvedValue(['198.51.100.12']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '198.51.100.12', family: 4 }]);

    let resolveConnectSeen!: () => void;
    const connectSeen = new Promise<void>((resolve) => {
      resolveConnectSeen = resolve;
    });
    let resolveSocketClosed!: () => void;
    const socketClosed = new Promise<void>((resolve) => {
      resolveSocketClosed = resolve;
    });

    const hangingProxy = await listen((_req, res) => {
      res.statusCode = 405;
      res.end();
    });
    const proxySockets = new Set<net.Socket>();
    hangingProxy.on('connect', (_req, clientSocket) => {
      // Hold CONNECT open without responding until client aborts.
      proxySockets.add(clientSocket);
      clientSocket.on('end', () => {
        clientSocket.destroy();
        resolveSocketClosed();
      });
      clientSocket.on('close', () => {
        proxySockets.delete(clientSocket);
        resolveSocketClosed();
      });
      resolveConnectSeen();
    });

    const safeFetch = createMcpSafeFetch();
    const controller = new AbortController();

    try {
      vi.stubEnv('HTTP_PROXY', `http://127.0.0.1:${getServerPort(hangingProxy)}`);
      vi.stubEnv('NO_PROXY', '');
      vi.stubEnv('no_proxy', '');

      const requestPromise = safeFetch('http://slow-proxy.example.test/mcp', {
        signal: controller.signal
      });
      await connectSeen;
      controller.abort(new DOMException('Caller aborted', 'AbortError'));

      await expect(requestPromise).rejects.toThrow();
      await socketClosed;
      await safeFetch.close();
    } finally {
      for (const socket of proxySockets) socket.destroy();
      await safeFetch.close();
      await closeServer(hangingProxy);
    }
  });

  const startStalledTlsServer = async () => {
    let resolveClientHello!: () => void;
    const clientHelloSeen = new Promise<void>((resolve) => {
      resolveClientHello = resolve;
    });
    let resolveUpstreamClosed!: () => void;
    const upstreamClosed = new Promise<void>((resolve) => {
      resolveUpstreamClosed = resolve;
    });

    const stalledSockets = new Set<net.Socket>();
    const server = net.createServer((socket) => {
      stalledSockets.add(socket);
      socket.once('data', () => resolveClientHello());
      socket.on('close', () => {
        stalledSockets.delete(socket);
        resolveUpstreamClosed();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Invalid stalled TLS server address');
    }

    return {
      port: address.port,
      clientHelloSeen,
      upstreamClosed,
      close: async () => {
        for (const socket of stalledSockets) socket.destroy();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    };
  };

  it('should cancel a stalled TLS handshake after proxy CONNECT 200 when caller AbortSignal aborts and close cleanly', async () => {
    vi.spyOn(dns, 'resolve4').mockResolvedValue(['198.51.100.12']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '198.51.100.12', family: 4 }]);

    const stalledTls = await startStalledTlsServer();
    const proxy = await startConnectProxy(stalledTls.port);
    const safeFetch = createMcpSafeFetch();
    const controller = new AbortController();

    try {
      vi.stubEnv('HTTPS_PROXY', `http://127.0.0.1:${proxy.port}`);
      vi.stubEnv('NO_PROXY', '');
      vi.stubEnv('no_proxy', '');

      const requestPromise = safeFetch('https://stalled-tls.example.test/mcp', {
        signal: controller.signal
      });
      await stalledTls.clientHelloSeen;
      controller.abort(new DOMException('Caller aborted', 'AbortError'));

      await expect(requestPromise).rejects.toMatchObject({ name: 'AbortError' });
      await stalledTls.upstreamClosed;
      await expect(
        Promise.race([
          safeFetch.close().then(() => 'closed'),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error('safeFetch.close hung after TLS abort')), 2000)
          )
        ])
      ).resolves.toBe('closed');
    } finally {
      await safeFetch.close();
      await Promise.all([proxy.close(), stalledTls.close()]);
    }
  });

  it('should abort an in-flight TLS handshake after proxy CONNECT 200 when safeFetch.close() is called', async () => {
    vi.spyOn(dns, 'resolve4').mockResolvedValue(['198.51.100.12']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '198.51.100.12', family: 4 }]);

    const stalledTls = await startStalledTlsServer();
    const proxy = await startConnectProxy(stalledTls.port);
    const safeFetch = createMcpSafeFetch();

    try {
      vi.stubEnv('HTTPS_PROXY', `http://127.0.0.1:${proxy.port}`);
      vi.stubEnv('NO_PROXY', '');
      vi.stubEnv('no_proxy', '');

      const requestPromise = safeFetch('https://close-during-tls.example.test/mcp');
      await stalledTls.clientHelloSeen;

      await expect(
        Promise.race([
          safeFetch.close().then(() => 'closed'),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error('safeFetch.close hung during TLS handshake')), 2000)
          )
        ])
      ).resolves.toBe('closed');
      await expect(requestPromise).rejects.toMatchObject({
        cause: expect.objectContaining({
          name: 'AbortError',
          message: 'MCP fetch closed'
        })
      });
      await stalledTls.upstreamClosed;
    } finally {
      await safeFetch.close();
      await Promise.all([proxy.close(), stalledTls.close()]);
    }
  });

  it('should abort a stalled DNS lookup in proxy connector when deadline fires, close cleanly, and skip CONNECT', async () => {
    vi.spyOn(dns, 'resolve4').mockResolvedValue(['198.51.100.12']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);

    let resolveLookupStarted!: () => void;
    const lookupStarted = new Promise<void>((resolve) => {
      resolveLookupStarted = resolve;
    });
    let resolveLookup!: (value: Array<{ address: string; family: 4 | 6 }>) => void;
    vi.spyOn(dns, 'lookup').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLookupStarted();
          resolveLookup = resolve as (value: Array<{ address: string; family: 4 | 6 }>) => void;
        }) as ReturnType<typeof dns.lookup>
    );

    const deadlineController = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadlineController.signal);
    const poolConnectSpy = vi.spyOn(Pool.prototype, 'connect');
    const safeFetch = createMcpSafeFetch();

    try {
      vi.stubEnv('HTTPS_PROXY', 'http://127.0.0.1:3128');
      vi.stubEnv('NO_PROXY', '');
      vi.stubEnv('no_proxy', '');

      const requestPromise = safeFetch('https://stalled-dns-timeout.example.test/mcp');
      await lookupStarted;

      deadlineController.abort(
        new DOMException('The operation was aborted due to timeout', 'TimeoutError')
      );

      await expect(
        Promise.race([
          requestPromise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('request hung waiting for DNS lookup')), 2000)
          )
        ])
      ).rejects.toMatchObject({
        name: 'TimeoutError'
      });
      await expect(
        Promise.race([
          safeFetch.close().then(() => 'closed'),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error('safeFetch.close hung waiting for DNS lookup')), 2000)
          )
        ])
      ).resolves.toBe('closed');

      resolveLookup([{ address: '198.51.100.12', family: 4 }]);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(poolConnectSpy).not.toHaveBeenCalled();
    } finally {
      resolveLookup?.([{ address: '198.51.100.12', family: 4 }]);
      await safeFetch.close();
    }
  });

  it('should abort a stalled DNS lookup in proxy connector when safeFetch.close() is called and skip CONNECT', async () => {
    vi.spyOn(dns, 'resolve4').mockResolvedValue(['198.51.100.12']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);

    let resolveLookupStarted!: () => void;
    const lookupStarted = new Promise<void>((resolve) => {
      resolveLookupStarted = resolve;
    });
    let resolveLookup!: (value: Array<{ address: string; family: 4 | 6 }>) => void;
    vi.spyOn(dns, 'lookup').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLookupStarted();
          resolveLookup = resolve as (value: Array<{ address: string; family: 4 | 6 }>) => void;
        }) as ReturnType<typeof dns.lookup>
    );

    const poolConnectSpy = vi.spyOn(Pool.prototype, 'connect');
    const safeFetch = createMcpSafeFetch();

    try {
      vi.stubEnv('HTTPS_PROXY', 'http://127.0.0.1:3128');
      vi.stubEnv('NO_PROXY', '');
      vi.stubEnv('no_proxy', '');

      const requestPromise = safeFetch('https://close-during-dns.example.test/mcp');
      await lookupStarted;

      await expect(
        Promise.race([
          safeFetch.close().then(() => 'closed'),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error('safeFetch.close hung during DNS lookup')), 2000)
          )
        ])
      ).resolves.toBe('closed');
      await expect(
        Promise.race([
          requestPromise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('request hung after close during DNS lookup')), 2000)
          )
        ])
      ).rejects.toMatchObject({
        cause: expect.objectContaining({
          name: 'AbortError',
          message: 'MCP fetch closed'
        })
      });

      resolveLookup([{ address: '198.51.100.12', family: 4 }]);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(poolConnectSpy).not.toHaveBeenCalled();
    } finally {
      resolveLookup?.([{ address: '198.51.100.12', family: 4 }]);
      await safeFetch.close();
    }
  });

  it('should abort a stalled HTTPS proxy TLS handshake when safeFetch.close() is called and release the proxy socket', async () => {
    vi.spyOn(dns, 'resolve4').mockResolvedValue(['198.51.100.12']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '198.51.100.12', family: 4 }]);

    const stalledProxy = await startStalledTlsServer();
    const safeFetch = createMcpSafeFetch();

    try {
      vi.stubEnv('HTTPS_PROXY', `https://127.0.0.1:${stalledProxy.port}`);
      vi.stubEnv('NO_PROXY', '');
      vi.stubEnv('no_proxy', '');

      const requestPromise = safeFetch('https://close-during-proxy-tls.example.test/mcp');
      await stalledProxy.clientHelloSeen;

      await expect(
        Promise.race([
          safeFetch.close().then(() => 'closed'),
          new Promise<string>((_, reject) =>
            setTimeout(
              () => reject(new Error('safeFetch.close hung during HTTPS proxy TLS handshake')),
              2000
            )
          )
        ])
      ).resolves.toBe('closed');
      await expect(
        Promise.race([
          requestPromise,
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('request hung after close during HTTPS proxy TLS handshake')),
              2000
            )
          )
        ])
      ).rejects.toMatchObject({
        cause: expect.objectContaining({
          name: 'AbortError',
          message: 'MCP fetch closed'
        })
      });
      await expect(
        Promise.race([
          stalledProxy.upstreamClosed.then(() => 'socket-closed'),
          new Promise<string>((_, reject) =>
            setTimeout(
              () => reject(new Error('proxy socket stayed open after safeFetch.close')),
              2000
            )
          )
        ])
      ).resolves.toBe('socket-closed');
    } finally {
      await safeFetch.close();
      await stalledProxy.close();
    }
  });

  it('should cancel a stalled HTTPS proxy TLS handshake when caller AbortSignal aborts and close cleanly', async () => {
    vi.spyOn(dns, 'resolve4').mockResolvedValue(['198.51.100.12']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '198.51.100.12', family: 4 }]);

    const stalledProxy = await startStalledTlsServer();
    const safeFetch = createMcpSafeFetch();
    const controller = new AbortController();

    try {
      vi.stubEnv('HTTPS_PROXY', `https://127.0.0.1:${stalledProxy.port}`);
      vi.stubEnv('NO_PROXY', '');
      vi.stubEnv('no_proxy', '');

      const requestPromise = safeFetch('https://abort-during-proxy-tls.example.test/mcp', {
        signal: controller.signal
      });
      await stalledProxy.clientHelloSeen;
      controller.abort(new DOMException('Caller aborted', 'AbortError'));

      await expect(
        Promise.race([
          requestPromise,
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('request hung after abort during HTTPS proxy TLS handshake')),
              2000
            )
          )
        ])
      ).rejects.toMatchObject({ name: 'AbortError' });
      await expect(
        Promise.race([
          stalledProxy.upstreamClosed.then(() => 'socket-closed'),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error('proxy socket stayed open after caller abort')), 2000)
          )
        ])
      ).resolves.toBe('socket-closed');
      await expect(
        Promise.race([
          safeFetch.close().then(() => 'closed'),
          new Promise<string>((_, reject) =>
            setTimeout(
              () => reject(new Error('safeFetch.close hung after HTTPS proxy TLS abort')),
              2000
            )
          )
        ])
      ).resolves.toBe('closed');
    } finally {
      await safeFetch.close();
      await stalledProxy.close();
    }
  });

  it('should initiate TLS handshake to an https proxy URL with proxy servername', async () => {
    vi.spyOn(dns, 'resolve4').mockResolvedValue(['198.51.100.12']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '198.51.100.12', family: 4 }]);

    let proxyServername: string | undefined;
    const tlsProxyServer = tls.createServer({
      SNICallback: (servername, cb) => {
        proxyServername = servername;
        cb(new Error('proxy-tls-captured'));
      }
    });
    await new Promise<void>((resolve) => tlsProxyServer.listen(0, '127.0.0.1', resolve));
    const tlsAddress = tlsProxyServer.address();
    if (!tlsAddress || typeof tlsAddress === 'string') {
      throw new Error('Invalid TLS proxy address');
    }

    const safeFetch = createMcpSafeFetch();
    try {
      vi.stubEnv('HTTP_PROXY', `https://localhost:${tlsAddress.port}`);
      vi.stubEnv('NO_PROXY', '');
      vi.stubEnv('no_proxy', '');

      await expect(safeFetch('http://target.example.test/mcp')).rejects.toThrow();
      expect(proxyServername).toBe('localhost');
    } finally {
      await safeFetch.close();
      await new Promise<void>((resolve) => tlsProxyServer.close(() => resolve()));
    }
  });

  it('should still reject private or loopback targets when an HTTP proxy is configured', async () => {
    getTestInstanceConfig().security.checkInternalIp = true;
    vi.stubEnv('HTTP_PROXY', 'http://127.0.0.1:3128');
    vi.stubEnv('NO_PROXY', '');
    vi.stubEnv('no_proxy', '');
    vi.spyOn(dns, 'resolve4').mockResolvedValue(['10.0.0.8']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
    const fetchImpl = vi.fn();
    const safeFetch = createMcpSafeFetch({ fetchImpl });

    try {
      await expect(safeFetch('http://127.0.0.1/mcp')).rejects.toBe(PRIVATE_URL_TEXT);
      await expect(safeFetch('http://169.254.169.254/latest/meta-data')).rejects.toBe(
        PRIVATE_URL_TEXT
      );
      await expect(safeFetch('http://private.example.test/mcp')).rejects.toBe(PRIVATE_URL_TEXT);
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      await safeFetch.close();
    }
  });

  it('should block redirects to internal targets when using an HTTP proxy', async () => {
    getTestInstanceConfig().security.checkInternalIp = true;
    vi.spyOn(dns, 'resolve4').mockResolvedValue(['198.51.100.12']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '198.51.100.12', family: 4 }]);
    const targetServer = await listen((_req, res) => {
      res.statusCode = 302;
      res.setHeader('Location', 'http://127.0.0.1:8080/mcp');
      res.end('redirect');
    });
    const proxy = await startConnectProxy(getServerPort(targetServer));
    const safeFetch = createMcpSafeFetch();

    try {
      vi.stubEnv('HTTP_PROXY', `http://127.0.0.1:${proxy.port}`);
      vi.stubEnv('NO_PROXY', '');
      vi.stubEnv('no_proxy', '');

      await expect(safeFetch('http://proxy.example.test/mcp')).rejects.toBe(PRIVATE_URL_TEXT);
    } finally {
      await safeFetch.close();
      await Promise.all([proxy.close(), closeServer(targetServer)]);
    }
  });

  it('should bypass the HTTP proxy and keep pinned-DNS direct fetch when NO_PROXY matches', async () => {
    getTestInstanceConfig().security.checkInternalIp = true;
    vi.stubEnv('HTTP_PROXY', 'http://127.0.0.1:3128');
    vi.stubEnv('NO_PROXY', 'direct.example.test');
    vi.stubEnv('no_proxy', '');
    vi.spyOn(dns, 'resolve4').mockResolvedValue(['8.8.8.8']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
    const lookup = vi
      .spyOn(dns, 'lookup')
      .mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const fetchImpl = vi.fn().mockResolvedValue(new Response('ok'));
    const safeFetch = createMcpSafeFetch({ fetchImpl });

    try {
      const response = await safeFetch('http://direct.example.test/mcp');
      expect(await response.text()).toBe('ok');
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const dispatcher = fetchImpl.mock.calls[0]?.[1]?.dispatcher;
      expect(dispatcher).toBeInstanceOf(Agent);
      expect(dispatcher).not.toBeInstanceOf(ProxyAgent);
      expect(lookup).toHaveBeenCalledTimes(1);
    } finally {
      await safeFetch.close();
    }
  });

  it('should evaluate NO_PROXY per hop across redirects from proxied host to NO_PROXY host', async () => {
    getTestInstanceConfig().security.checkInternalIp = false;
    const carrierHost = getReachablePrivateHost();
    if (!carrierHost) return;

    const directTarget = await listen((req, res) => {
      res.end(JSON.stringify({ direct: true, host: req.headers.host }));
    }, '0.0.0.0');
    const directPort = getServerPort(directTarget);

    const proxiedRedirect = await listen((_req, res) => {
      res.statusCode = 302;
      res.setHeader('Location', `http://${carrierHost}:${directPort}/mcp`);
      res.end('redirect');
    });
    const proxy = await startConnectProxy(getServerPort(proxiedRedirect));

    vi.spyOn(dns, 'resolve4').mockResolvedValue(['198.51.100.12']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '198.51.100.12', family: 4 }]);

    const safeFetch = createMcpSafeFetch();
    try {
      vi.stubEnv('HTTP_PROXY', `http://127.0.0.1:${proxy.port}`);
      vi.stubEnv('NO_PROXY', carrierHost);
      vi.stubEnv('no_proxy', '');

      const response = await safeFetch('http://proxied.example.test/mcp');
      expect(await response.json()).toEqual({
        direct: true,
        host: `${carrierHost}:${directPort}`
      });
      expect(proxy.getConnectCount()).toBe(1);
      expect(proxy.getConnectedTarget()).toBe('198.51.100.12:80');
    } finally {
      await safeFetch.close();
      await Promise.all([proxy.close(), closeServer(proxiedRedirect), closeServer(directTarget)]);
    }
  });

  it('should follow safe redirects hop by hop', async () => {
    getTestInstanceConfig().security.checkInternalIp = false;
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
    getTestInstanceConfig().security.checkInternalIp = false;
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
    getTestInstanceConfig().security.checkInternalIp = false;
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
    getTestInstanceConfig().security.checkInternalIp = false;
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
