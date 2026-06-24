import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { AppSchemaType } from '@fastgpt/global/core/app/type';
import { type McpToolConfigType } from '@fastgpt/global/core/app/tool/mcpTool/type';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { MongoApp } from './schema';
import type { McpToolDataType } from '@fastgpt/global/core/app/tool/mcpTool/type';
import { UserError } from '@fastgpt/global/common/error/utils';
import $RefParser from '@apidevtools/json-schema-ref-parser';
import { getLogger, LogCategories } from '../../common/logger';
import { isInternalAddress, PRIVATE_URL_TEXT } from '../../common/system/utils';

const logger = getLogger(LogCategories.MODULE.APP.MCP_TOOLS);

const MCP_SAFE_FETCH_MAX_REDIRECTS = 5;
const MCP_REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const MCP_SENSITIVE_REDIRECT_HEADERS = new Set(['authorization', 'cookie', 'proxy-authorization']);

type McpFetch = (url: string | URL, init?: RequestInit) => Promise<Response>;

export const assertMCPUrlNotInternal = async (url: string) => {
  if (await isInternalAddress(url)) {
    return Promise.reject(PRIVATE_URL_TEXT);
  }
};

const headersInitToRecord = (headers?: HeadersInit): Record<string, string> => {
  const record: Record<string, string> = {};

  if (!headers) return record;

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }

  if (Array.isArray(headers)) {
    headers.forEach(([key, value]) => {
      record[key] = value;
    });
    return record;
  }

  Object.entries(headers).forEach(([key, value]) => {
    record[key] = String(value);
  });
  return record;
};

const isMcpRedirectResponse = (response: Response) => {
  return MCP_REDIRECT_STATUS_CODES.has(response.status) && !!response.headers.get('location');
};

const resolveMcpRedirectUrl = (location: string, currentUrl: string) => {
  const redirectUrl = new URL(location, currentUrl);

  if (redirectUrl.protocol !== 'http:' && redirectUrl.protocol !== 'https:') {
    throw new Error('MCP redirect target only supports http/https protocol');
  }

  return redirectUrl.toString();
};

const getMcpRedirectHeaders = ({
  headers,
  currentUrl,
  redirectUrl,
  shouldSwitchToGet
}: {
  headers?: HeadersInit;
  currentUrl: string;
  redirectUrl: string;
  shouldSwitchToGet: boolean;
}) => {
  const current = new URL(currentUrl);
  const redirect = new URL(redirectUrl);
  const shouldDropSensitiveHeaders =
    current.protocol !== redirect.protocol || current.host !== redirect.host;

  return Object.entries(headersInitToRecord(headers)).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      const lowerKey = key.toLowerCase();

      // 301/302 POST 与 303 会转成 GET，继续携带 content-* 容易让目标端误判请求体。
      if (shouldSwitchToGet && lowerKey.startsWith('content-')) {
        return acc;
      }

      // MCP header 中常带有鉴权密钥，跨 host/protocol 重定向时不能泄露给新目标。
      if (shouldDropSensitiveHeaders && MCP_SENSITIVE_REDIRECT_HEADERS.has(lowerKey)) {
        return acc;
      }

      if (lowerKey === 'host') {
        return acc;
      }

      acc[key] = value;
      return acc;
    },
    {}
  );
};

const getMcpRedirectRequestInit = ({
  init,
  response,
  currentUrl,
  redirectUrl
}: {
  init?: RequestInit;
  response: Response;
  currentUrl: string;
  redirectUrl: string;
}): RequestInit => {
  const method = (init?.method || 'GET').toUpperCase();
  const shouldSwitchToGet =
    ((response.status === 301 || response.status === 302) && method === 'POST') ||
    (response.status === 303 && method !== 'GET' && method !== 'HEAD');

  return {
    ...init,
    // Node fetch 默认会自动跟随重定向；这里必须保持 manual，才能逐跳做 SSRF 校验。
    redirect: 'manual',
    method: shouldSwitchToGet ? 'GET' : init?.method,
    body: shouldSwitchToGet ? undefined : init?.body,
    headers: getMcpRedirectHeaders({
      headers: init?.headers,
      currentUrl,
      redirectUrl,
      shouldSwitchToGet
    })
  };
};

/**
 * 为 MCP SDK transport 注入安全 fetch。
 *
 * MCP 连接本身会先校验初始 URL，但 SDK 内部默认使用 fetch 自动跟随重定向。
 * 这会让“初始 URL 合法，Location 跳到内网地址”的场景绕过 SSRF 防护。
 * 该 fetch 通过 `redirect: manual` 接管重定向流程，并对每一跳目标重新执行
 * 内网地址校验；跨 host/protocol 跳转时还会移除鉴权类 header，避免 MCP 密钥泄露。
 */
export const createMcpSafeFetch = ({
  maxRedirects = MCP_SAFE_FETCH_MAX_REDIRECTS,
  fetchImpl = fetch as McpFetch
}: {
  maxRedirects?: number;
  fetchImpl?: McpFetch;
} = {}): McpFetch => {
  const redirectLimit = Math.max(0, maxRedirects);

  return async (url, init) => {
    let currentUrl = new URL(url.toString()).toString();
    let currentInit: RequestInit = {
      ...init,
      redirect: 'manual'
    };

    for (let redirectCount = 0; redirectCount <= redirectLimit; redirectCount++) {
      await assertMCPUrlNotInternal(currentUrl);

      const response = await fetchImpl(currentUrl, currentInit);

      if (!isMcpRedirectResponse(response)) {
        return response;
      }

      if (redirectCount === redirectLimit) {
        throw new Error(`Maximum MCP redirects exceeded: ${redirectLimit}`);
      }

      const redirectUrl = resolveMcpRedirectUrl(response.headers.get('location')!, currentUrl);
      await assertMCPUrlNotInternal(redirectUrl);

      currentInit = getMcpRedirectRequestInit({
        init: currentInit,
        response,
        currentUrl,
        redirectUrl
      });
      currentUrl = redirectUrl;

      await response.body?.cancel().catch(() => undefined);
    }

    throw new Error(`Maximum MCP redirects exceeded: ${redirectLimit}`);
  };
};

const shouldFallbackToSSE = (error: unknown): boolean => {
  return (
    error instanceof StreamableHTTPError &&
    typeof error.code === 'number' &&
    error.code >= 400 &&
    error.code < 500
  );
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

export class MCPClient {
  private client: Client;
  private url: string;
  private headers: Record<string, any> = {};
  private connectionPromise: Promise<Client> | null = null;

  constructor(config: { url: string; headers: Record<string, any> }) {
    this.url = config.url;
    this.headers = config.headers;
    this.client = new Client({
      name: 'FastGPT-MCP-client',
      version: '1.0.0'
    });
  }

  private async getConnection(): Promise<Client> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this.doConnect().catch((error) => {
      // 连接失败时清除缓存，允许下次重试
      this.connectionPromise = null;
      throw error;
    });

    return this.connectionPromise;
  }

  private async doConnect(): Promise<Client> {
    await assertMCPUrlNotInternal(this.url);
    const safeFetch = createMcpSafeFetch();

    // 避免连接重复，强制关闭一次
    await this.client.close().catch(() => {});

    logger.debug('Start connect mcp client', { url: this.url });
    try {
      const transport = new StreamableHTTPClientTransport(new URL(this.url), {
        fetch: safeFetch,
        requestInit: {
          headers: this.headers
        }
      });
      await this.client.connect(transport);
    } catch (streamableError: any) {
      if (!shouldFallbackToSSE(streamableError)) {
        logger.info('Streamable HTTP error', streamableError);
        throw streamableError;
      }

      try {
        await this.client.connect(
          new SSEClientTransport(new URL(this.url), {
            fetch: safeFetch,
            requestInit: {
              headers: this.headers
            },
            eventSourceInit: {
              fetch: (url, init) => {
                const mergedHeaders = {
                  ...this.headers
                };

                Object.assign(mergedHeaders, headersInitToRecord(init?.headers));

                return safeFetch(url, {
                  ...init,
                  headers: mergedHeaders
                });
              }
            }
          })
        );
      } catch (sseError: any) {
        logger.info('SSE error', sseError);
        throw new Error(
          `MCP connection failed. Streamable HTTP: ${getErrorMessage(
            streamableError
          )}; SSE: ${getErrorMessage(sseError)}`
        );
      }
    }

    this.client.onerror = (error) => {
      // 忽略掉不支持 streamable 的错误
      if (error?.message?.includes('SSE stream: Not Found')) return;
      logger.warn('MCP client connection error', { url: this.url, error });
      this.connectionPromise = null;
    };
    this.client.onclose = () => {
      this.connectionPromise = null;
    };

    return this.client;
  }

  // 内部方法：关闭连接
  async closeConnection() {
    this.connectionPromise = null;
    try {
      await retryFn(() => this.client.close(), 3);
      logger.debug('MCP client connection closed', { url: this.url });
    } catch (error) {
      logger.error('MCP client failed to close connection', { url: this.url, error });
    }
  }

  /**
   * Get available tools list
   * @returns List of tools
   */
  public async getTools(): Promise<McpToolConfigType[]> {
    try {
      const client = await this.getConnection();
      const response = await client.listTools();

      if (!Array.isArray(response.tools)) {
        return Promise.reject(new UserError('[MCP Client] Get tools response is not an array'));
      }

      const tools = await Promise.all(
        response.tools.map(async (tool) => {
          const processedSchema = await (async () => {
            if (tool.inputSchema) {
              try {
                // Deep clone to avoid dereference() mutating the original object
                const schemaClone = JSON.parse(JSON.stringify(tool.inputSchema));
                return await $RefParser.dereference(schemaClone, {
                  resolve: {
                    // Disable file and HTTP $ref resolution to prevent SSRF
                    file: false,
                    http: false
                  }
                });
              } catch (error) {
                logger.error(`Failed to dereference schema for tool "${tool.name}":`, { error });
                return tool.inputSchema;
              }
            }
          })();

          return {
            name: tool.name,
            description: tool.description || '',
            inputSchema: processedSchema
              ? {
                  type: 'object',
                  ...processedSchema,
                  properties: processedSchema.properties || {}
                }
              : {
                  type: 'object',
                  properties: {}
                }
          };
        })
      );

      // @ts-ignore
      return tools;
    } catch (error) {
      logger.error('MCP client failed to get tools', { url: this.url, error });
      return Promise.reject(error);
    } finally {
      await this.closeConnection();
    }
  }

  /**
   * Call tool
   * @param toolName Tool name
   * @param params Parameters
   * @returns Tool execution result
   */
  public async toolCall({
    toolName,
    params,
    closeConnection = true
  }: {
    toolName: string;
    params: Record<string, any>;
    closeConnection?: boolean;
  }): Promise<any> {
    try {
      const client = await this.getConnection();
      logger.debug('MCP client calling tool', { url: this.url, toolName, params });

      return await client.callTool(
        {
          name: toolName,
          arguments: params
        },
        undefined,
        {
          timeout: 300000
        }
      );
    } catch (error) {
      logger.error('MCP client tool call failed', { url: this.url, toolName, error });
      return Promise.reject(error);
    } finally {
      if (closeConnection) {
        await this.closeConnection();
      }
    }
  }
}

export const getMCPChildren = async (app: AppSchemaType) => {
  const isNewMcp = !!app.modules[0].toolConfig?.mcpToolSet;
  const id = String(app._id);

  if (isNewMcp) {
    return (
      app.modules[0].toolConfig?.mcpToolSet?.toolList.map((item) => ({
        ...item,
        id: `${AppToolSourceEnum.mcp}-${id}/${item.name}`,
        avatar: app.avatar
      })) ?? []
    );
  } else {
    // Old mcp toolset
    const children = await MongoApp.find({
      teamId: app.teamId,
      parentId: id
    }).lean();

    return children.map((item) => {
      const node = item.modules[0];
      const toolData: McpToolDataType = node.inputs[0].value;

      return {
        avatar: app.avatar,
        id: `${AppToolSourceEnum.mcp}-${id}/${item.name}`,
        ...toolData
      };
    });
  }
};
