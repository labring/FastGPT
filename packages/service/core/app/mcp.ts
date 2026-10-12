import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { AppSchemaType } from '@fastgpt/global/core/app/type';
import type { McpToolConfigType } from '@fastgpt/global/core/app/tool/mcpTool/type';
import {
  SecretValueTypeSchema,
  StoreSecretValueTypeSchema,
  type StoreSecretValueType
} from '@fastgpt/global/common/secret/type';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { Types } from '../../common/mongo';
import { MongoApp } from './schema';
import { UserError } from '@fastgpt/global/common/error/utils';
import $RefParser from '@apidevtools/json-schema-ref-parser';
import { getLogger, LogCategories } from '../../common/logger';
import dns from 'dns/promises';
import { isIP, type LookupFunction } from 'net';
import { Agent, type Dispatcher } from 'undici';
import { getProxyForUrl } from 'proxy-from-env';
import {
  isInternalAddress,
  isInternalResolvedIP,
  PRIVATE_URL_TEXT
} from '../../common/system/utils';
import { decodeMcpToolSetNodesFromStorage } from './jsonSchemaStorage';
import { McpToolSetRuntimeConfigSchema } from '@fastgpt/global/core/workflow/type/node';
import { getAppLatestVersion, type AppPublishedWorkflow } from './version/controller';

const logger = getLogger(LogCategories.MODULE.APP.MCP_TOOLS);

type McpChildToolType = McpToolConfigType & {
  id: string;
  avatar: string;
  url?: string;
  headerSecret?: StoreSecretValueType;
};

const MCP_SAFE_FETCH_MAX_REDIRECTS = 5;
const MCP_REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const MCP_SENSITIVE_REDIRECT_HEADERS = new Set(['authorization', 'cookie', 'proxy-authorization']);

type McpRequestInit = RequestInit & {
  dispatcher?: Dispatcher;
};

type McpFetch = (url: string | URL, init?: McpRequestInit) => Promise<Response>;

type McpSafeFetch = McpFetch & {
  close: () => Promise<void>;
};

type ResolvedAddress = {
  address: string;
  family: 4 | 6;
};

/**
 * 解析 MCP 目标将要使用的地址，并在返回给 socket 前完成最终 SSRF 校验。
 *
 * 预检使用的是独立的 DNS 请求，不能防止 DNS rebinding；这里的地址会被
 * createPinnedLookup 固定交给 Node 建连，因此校验结果和实际连接目标保持一致。
 */
const resolveMcpConnectAddress = async (hostname: string): Promise<ResolvedAddress> => {
  const normalizedHostname = hostname.replace(/^\[|\]$/g, '');
  const ipFamily = isIP(normalizedHostname);

  if (ipFamily) {
    if (isInternalResolvedIP(normalizedHostname)) {
      throw new Error(PRIVATE_URL_TEXT);
    }

    return {
      address: normalizedHostname,
      family: ipFamily as 4 | 6
    };
  }

  const resolved = await dns.lookup(normalizedHostname, {
    all: true,
    verbatim: true
  });

  if (resolved.length === 0) {
    throw new Error('DNS lookup returned no address');
  }

  // lookup 按约定只返回 IP；拒绝异常值，避免把 hostname 再交给底层隐式解析。
  const validatedResolved = resolved.map(({ address, family }) => {
    const addressFamily = isIP(address);
    if (addressFamily !== family || (addressFamily !== 4 && addressFamily !== 6)) {
      throw new Error('DNS lookup returned an invalid address');
    }
    return { address, family: addressFamily } as ResolvedAddress;
  });

  // 不能只检查第一条记录，否则 Node 的地址选择可能落到未校验的内网地址。
  if (validatedResolved.some(({ address }) => isInternalResolvedIP(address))) {
    throw new Error(PRIVATE_URL_TEXT);
  }

  const firstAddress = validatedResolved[0];
  if (!firstAddress) throw new Error('DNS lookup returned no address');

  return {
    address: firstAddress.address,
    family: firstAddress.family
  };
};

/**
 * 返回只提供已校验地址的 lookup，阻止 undici 在真正建连时再次解析 hostname。
 */
const createPinnedLookup = (resolved: ResolvedAddress): LookupFunction => {
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [resolved]);
      return;
    }

    callback(null, resolved.address, resolved.family);
  };
};

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
 * 直连请求还会把最终校验过的 DNS 地址固定到 undici dispatcher，避免
 * “检查时是公网 IP、建连时变成内网 IP”的 DNS rebinding TOCTOU。
 */
export const createMcpSafeFetch = ({
  maxRedirects = MCP_SAFE_FETCH_MAX_REDIRECTS,
  fetchImpl = fetch as McpFetch
}: {
  maxRedirects?: number;
  fetchImpl?: McpFetch;
} = {}): McpSafeFetch => {
  const redirectLimit = Math.max(0, maxRedirects);
  const dispatchers = new Map<string, Dispatcher>();

  const getDispatcher = async (url: string): Promise<Dispatcher> => {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error('MCP URL only supports http/https protocol');
    }

    // 代理端会重新解析目标域名，本进程无法保证它连接的是已校验的 IP；必须拒绝。
    if (getProxyForUrl(url)) {
      throw new Error('MCP requests through an HTTP proxy are not supported by SSRF protection');
    }

    const resolved = await resolveMcpConnectAddress(parsedUrl.hostname);
    const key = `${parsedUrl.origin}|${resolved.address}|${resolved.family}`;
    const existing = dispatchers.get(key);
    if (existing) return existing;

    const dispatcher = new Agent({
      connect: {
        lookup: createPinnedLookup(resolved)
      }
    });
    dispatchers.set(key, dispatcher);
    return dispatcher;
  };

  const close = async () => {
    const currentDispatchers = [...dispatchers.values()];
    dispatchers.clear();
    await Promise.all(currentDispatchers.map((dispatcher) => dispatcher.close().catch(() => {})));
  };

  const safeFetch = (async (url, init) => {
    let currentUrl = new URL(url.toString()).toString();
    let currentInit: McpRequestInit = {
      ...init,
      redirect: 'manual'
    };

    for (let redirectCount = 0; redirectCount <= redirectLimit; redirectCount++) {
      await assertMCPUrlNotInternal(currentUrl);

      const dispatcher = await getDispatcher(currentUrl);
      // dispatcher 必须覆盖调用方传入值，避免自定义 dispatcher 绕过安全 lookup。
      const response = await fetchImpl(currentUrl, {
        ...currentInit,
        dispatcher
      });

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
  }) as McpSafeFetch;

  safeFetch.close = close;
  return safeFetch;
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
  private safeFetch: McpSafeFetch | null = null;

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

    // 避免连接重复，强制关闭一次
    await this.client.close().catch(() => {});
    const safeFetch = createMcpSafeFetch();
    this.safeFetch = safeFetch;

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
        await this.closeSafeFetch();
        logger.info('Streamable HTTP error', streamableError);
        throw streamableError;
      }

      try {
        await this.client.connect(
          new SSEClientTransport(new URL(this.url), {
            fetch: safeFetch,
            requestInit: {
              headers: this.headers
            }
          })
        );
      } catch (sseError: any) {
        await this.closeSafeFetch();
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
      void this.closeSafeFetch();
    };
    this.client.onclose = () => {
      this.connectionPromise = null;
      void this.closeSafeFetch();
    };

    return this.client;
  }

  /**
   * 关闭 MCP fetch 使用的 dispatcher。
   * MCP 工作流可能复用同一个 client，因此 dispatcher 必须跟随 client 生命周期释放。
   */
  private async closeSafeFetch() {
    const safeFetch = this.safeFetch;
    this.safeFetch = null;
    await safeFetch?.close().catch(() => {});
  }

  // 内部方法：关闭连接
  async closeConnection() {
    this.connectionPromise = null;
    try {
      await retryFn(() => this.client.close(), 3);
      await this.closeSafeFetch();
      logger.debug('MCP client connection closed', { url: this.url });
    } catch (error) {
      await this.closeSafeFetch();
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

/**
 * 规范化历史单个 token 或 Map 形式的请求头。
 * 旧版本同时存在命名请求头映射和单个密钥；映射优先，避免重复包装 Authorization。
 */
export const normalizeLegacyMcpHeaderSecret = (
  headerSecret: unknown
): StoreSecretValueType | undefined => {
  if (!headerSecret || typeof headerSecret !== 'object') return undefined;
  if (Object.keys(headerSecret).length === 0) return undefined;

  const headerMap = StoreSecretValueTypeSchema.safeParse(headerSecret);
  if (headerMap.success && Object.keys(headerMap.data).length > 0) return headerMap.data;

  const singleToken = SecretValueTypeSchema.safeParse(headerSecret);
  if (singleToken.success && (singleToken.data.value || singleToken.data.secret)) {
    return { Authorization: singleToken.data };
  }

  return undefined;
};

/**
 * 从历史 MongoApp 子文档列表中聚合出标准 MCP ToolSet 配置。
 * 用于未迁移历史数据读取和 4171 迁移任务建版。
 */
export const parseLegacyMcpChildApps = (
  children: Array<{
    name?: string;
    intro?: string;
    modules?: Array<{ inputs?: Array<{ value?: unknown }> }>;
  }>
): {
  url?: string;
  headerSecret?: StoreSecretValueType;
  toolList: Array<McpToolConfigType & { url?: string; headerSecret?: StoreSecretValueType }>;
} => {
  let url: string | undefined;
  let headerSecret: StoreSecretValueType | undefined;
  const toolList: Array<McpToolConfigType & { url?: string; headerSecret?: StoreSecretValueType }> =
    [];

  for (const child of children) {
    const rawVal = child.modules?.[0]?.inputs?.[0]?.value as any;
    if (!rawVal || typeof rawVal !== 'object') continue;

    const childHeaderSecret = normalizeLegacyMcpHeaderSecret(rawVal.headerSecret);
    const name = String(rawVal.name || child.name || '');
    const description = String(rawVal.description || child.intro || '');
    const urlVal = typeof rawVal.url === 'string' ? rawVal.url : undefined;
    const inputSchema = rawVal.inputSchema;

    if (!name) continue;

    if (!url && urlVal) url = urlVal;
    if (!headerSecret && childHeaderSecret) {
      headerSecret = childHeaderSecret;
    }

    toolList.push({
      name,
      description,
      inputSchema,
      url: urlVal,
      ...(childHeaderSecret ? { headerSecret: childHeaderSecret } : {})
    });
  }

  return { url, headerSecret, toolList };
};

/** Read the current or legacy MCP child tools from a toolset app. */
export const getMCPChildren = async (
  app: AppSchemaType,
  workflow?: AppPublishedWorkflow
): Promise<McpChildToolType[]> => {
  if (app.type !== AppTypeEnum.mcpToolSet) return [];

  const id = String(app._id);
  const nodes = decodeMcpToolSetNodesFromStorage(
    (workflow ?? (await getAppLatestVersion(id, app))).nodes
  );
  const node = nodes[0];

  const toolSet = McpToolSetRuntimeConfigSchema.safeParse(node?.toolConfig?.mcpToolSet).data;

  if (toolSet) {
    return (toolSet.toolList ?? []).map((item) => ({
      ...item,
      id: `${AppToolSourceEnum.mcp}-${id}/${item.name}`,
      avatar: app.avatar,
      url: toolSet.url,
      headerSecret: toolSet.headerSecret ?? undefined
    }));
  }

  // 兜底：未迁移或无 Version 的历史数据，按 parentId 回退查询旧子 App
  if (!Types.ObjectId.isValid(id)) return [];

  const legacyChildren = await MongoApp.find({
    teamId: app.teamId,
    parentId: id
  }).lean();

  const { url, headerSecret, toolList } = parseLegacyMcpChildApps(legacyChildren as any);
  return toolList.map((item) => ({
    name: item.name,
    description: item.description,
    inputSchema: item.inputSchema,
    id: `${AppToolSourceEnum.mcp}-${id}/${item.name}`,
    avatar: app.avatar,
    url: item.url || url,
    headerSecret: item.headerSecret || headerSecret
  }));
};
