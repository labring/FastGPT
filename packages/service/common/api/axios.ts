import _, {
  AxiosError,
  CanceledError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig
} from 'axios';
import dns from 'dns/promises';
import http from 'http';
import https from 'https';
import net, { isIP } from 'net';
import tls from 'tls';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { ProxyAgent, type ProxyAgentOptions } from 'proxy-agent';
import { getProxyForUrl } from 'proxy-from-env';
import { isDevEnv } from '@fastgpt/global/common/system/constants';
import { isSocks5ProxyProtocol, parseSupportedOutboundProxyUrl } from '../proxy/utils';
import { isInternalAddress, isInternalResolvedIP, PRIVATE_URL_TEXT } from '../system/utils';
import { getServiceAxiosMaxContentLength } from '../system/constants';

/**
 * 给 shared axios 实例添加 SSRF 防护。
 *
 * 这里同时接管 axios 的重定向逻辑: axios/follow-redirects 的自动跳转发生在
 * request interceptor 之后,如果不手动处理,302 Location 指向内网时不会再次进入
 * isInternalAddress()。因此 safe axios 会强制关闭底层自动跳转,再在 response
 * interceptor 中逐跳解析 Location、复用同一套 SSRF 策略校验后再发起下一跳请求。
 */
const addSSRFInterceptor = (instance: AxiosInstance) => {
  instance.interceptors.request.use(async (config): Promise<InternalAxiosRequestConfig> => {
    const safeConfig = config as SafeRedirectInternalConfig;
    const redirectState = safeConfig.__safeRedirect ?? {
      count: 0,
      maxRedirects:
        typeof safeConfig.maxRedirects === 'number'
          ? safeConfig.maxRedirects
          : SAFE_AXIOS_MAX_REDIRECTS,
      proxy: safeConfig.proxy,
      validateStatus: safeConfig.validateStatus
    };
    const preparedConfig = await prepareSafeRequestConfig({
      ...safeConfig,
      __safeRedirect: redirectState
    });

    const nextConfigWithRedirect: SafeRedirectInternalConfig = {
      ...preparedConfig,
      // 禁用底层自动跳转,保留调用方 maxRedirects 语义给手动跳转状态使用。
      maxRedirects: 0,
      validateStatus: getRedirectValidateStatus(
        redirectState.validateStatus,
        redirectState.maxRedirects
      )
    };

    return nextConfigWithRedirect;
  });

  instance.interceptors.response.use(async (response) => {
    if (!shouldRedirect(response)) return response;

    const config = response.config as SafeRedirectConfig;
    const redirectState = config.__safeRedirect;
    const currentUrl = buildRequestUrl(config);
    // 理论上 request interceptor 会注入状态；缺失时按普通响应返回,避免误处理其它实例响应。
    if (!redirectState || !currentUrl) return response;

    if (redirectState.count >= redirectState.maxRedirects) {
      return Promise.reject(new Error(`Maximum redirects exceeded: ${redirectState.maxRedirects}`));
    }

    const redirectUrl = resolveRedirectUrl(response.headers.location, currentUrl);
    if (await isInternalAddress(redirectUrl)) {
      return Promise.reject(new Error(PRIVATE_URL_TEXT));
    }

    const redirectConfig = getRedirectConfig(config, response, currentUrl, redirectUrl);

    const nextConfig: SafeRedirectConfig = {
      ...redirectConfig,
      proxy: redirectState.proxy,
      validateStatus: redirectState.validateStatus,
      __safeRedirect: {
        ...redirectState,
        count: redirectState.count + 1
      }
    };

    return instance.request(nextConfig);
  });

  return instance;
};

const createProxyAgent = (options?: ProxyAgentOptions) => new ProxyAgent(options);

const SAFE_AXIOS_MAX_REDIRECTS = 5;
const DEFAULT_PROXY_CONNECT_TIMEOUT_MS = 30_000;
const PROXY_AUTHORIZATION = 'Proxy-Authorization';
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

export type SafeAxiosRequestOptions = {
  /** 请求前及每次重定向时执行入口专属的 URL 策略。 */
  validateUrl?: (url: string) => boolean;
  rejectUnauthorized?: boolean;
};

export type SafeAxiosRequestConfig = AxiosRequestConfig & {
  __safeAxios?: SafeAxiosRequestOptions;
};

/**
 * 手动重定向状态。
 *
 * count/maxRedirects 用于替代 axios/follow-redirects 的跳转次数控制。
 * proxy 保存显式代理设置，避免下一跳继承为关闭 axios 自动代理设置的 false。
 * validateStatus 保存调用方原始成功状态判定,因为 request interceptor 会临时允许
 * 3xx 进入 response interceptor,最终非重定向响应仍需按调用方语义判断成功/失败。
 */
type SafeRedirectState = {
  count: number;
  maxRedirects: number;
  proxy?: AxiosRequestConfig['proxy'];
  getProxyAuthorization?: (origin: string) => string | undefined;
  validateStatus?: AxiosRequestConfig['validateStatus'];
};

type SafeRedirectConfig = AxiosRequestConfig & {
  __safeRedirect?: SafeRedirectState;
  __safeAxios?: SafeAxiosRequestOptions;
};

type SafeRedirectInternalConfig = InternalAxiosRequestConfig & {
  __safeRedirect?: SafeRedirectState;
  __safeAxios?: SafeAxiosRequestOptions;
};

type ResolvedAddress = {
  address: string;
  family: 4 | 6;
};

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | ResolvedAddress[],
  family?: number
) => void;

/**
 * 对 safe axios 的请求做统一 SSRF 预检，并按本跳路由统一选择直连或代理 transport。
 *
 * 代理路径保留本机 isInternalAddress() best-effort 预检，域名解析与出站 ACL 交由代理层处理；
 * 直连路径（含命中 NO_PROXY）在建连前固定校验后的 IP，避免 DNS rebinding。
 */
const prepareSafeRequestConfig = async (
  config: SafeRedirectInternalConfig
): Promise<SafeRedirectInternalConfig> => {
  const requestUrl = buildRequestUrl(config);
  if (!requestUrl) return config;

  if (config.__safeAxios?.validateUrl && !config.__safeAxios.validateUrl(requestUrl)) {
    throw new Error('Invalid file URL domain');
  }

  if (await isInternalAddress(requestUrl)) {
    return Promise.reject(new Error(PRIVATE_URL_TEXT));
  }

  return attachRequestAgent(config, requestUrl);
};

/**
 * 根据原始请求 URL 选择显式代理或命中的环境代理（显式代理优先于环境代理）。
 *
 * 工厂默认的 proxy: false 仅用于关闭 axios 自动代理，环境变量由本入口统一处理。
 */
const resolveProxyUrl = (requestUrl: string, explicitProxy: AxiosRequestConfig['proxy']) => {
  if (!explicitProxy) {
    const proxyUrl = getProxyForUrl(requestUrl);
    return proxyUrl ? new URL(proxyUrl) : undefined;
  }

  const { host, port, auth, protocol = 'http' } = explicitProxy;
  const proxyHost = isIP(host) === 6 ? `[${host}]` : host;
  const proxyUrl = new URL(`${protocol.replace(/:$/, '')}://${proxyHost}`);
  if (port) proxyUrl.port = String(port);
  if (auth) {
    proxyUrl.username = encodeURIComponent(auth.username ?? '');
    proxyUrl.password = encodeURIComponent(auth.password ?? '');
  }
  return proxyUrl;
};

type SafeProxyRequestMeta = Pick<
  AxiosRequestConfig,
  'timeout' | 'timeoutErrorMessage' | 'transitional' | 'signal' | 'cancelToken'
>;

type SafeProxyTarget = {
  rejectUnauthorized: boolean;
  request: SafeProxyRequestMeta;
};

/**
 * 在代理握手阶段统一绑定超时（默认 30s）、取消信号和请求关闭事件，
 * 确保任意阶段超时或取消都能通过 AbortController 销毁底层代理 socket。
 */
const runProxyHandshake = async <T>(
  request: http.ClientRequest,
  handshake: AbortController,
  requestMeta: SafeProxyRequestMeta,
  fn: () => Promise<T>
): Promise<T> => {
  const { signal, cancelToken, timeout = 0, timeoutErrorMessage, transitional } = requestMeta;
  const handshakeTimeout = timeout > 0 ? timeout : DEFAULT_PROXY_CONNECT_TIMEOUT_MS;
  const cancel = (reason: unknown) => handshake.abort(reason);
  const onAbort = () => cancel(new CanceledError());
  if (signal?.aborted || request.destroyed) onAbort();
  signal?.addEventListener?.('abort', onAbort, { once: true });
  request.once('close', onAbort);
  cancelToken?.subscribe(cancel);
  const deadline = setTimeout(() => {
    cancel(
      new AxiosError(
        timeoutErrorMessage ??
          (timeout > 0
            ? `timeout of ${timeout}ms exceeded`
            : `Proxy CONNECT handshake timed out after ${handshakeTimeout} ms`),
        transitional?.clarifyTimeoutError ? AxiosError.ETIMEDOUT : AxiosError.ECONNABORTED
      )
    );
  }, handshakeTimeout).unref();

  try {
    handshake.signal.throwIfAborted();
    return await fn();
  } catch (error) {
    handshake.signal.throwIfAborted();
    throw error;
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener?.('abort', onAbort);
    request.removeListener('close', onAbort);
    cancelToken?.unsubscribe(cancel);
  }
};

/**
 * HTTP 目标经 HTTP/HTTPS 代理的转发 Agent。
 *
 * 完整保留 HttpProxyAgent.addRequest() 构造 RFC 9112 absolute-form 请求目标的流程
 *（避免 query 中包含 `://` 时跳过重写），仅在 connect() 阶段绑定握手超时与取消清理。
 */
class SafeHttpProxyAgent extends HttpProxyAgent<string> {
  private readonly handshake: AbortController;
  private readonly requestMeta: SafeProxyRequestMeta;

  constructor(
    proxyUrl: URL,
    {
      proxyAuthorization,
      request
    }: {
      proxyAuthorization?: string;
      request: SafeProxyRequestMeta;
    }
  ) {
    const handshake = new AbortController();
    super(proxyUrl, {
      signal: handshake.signal,
      headers: proxyAuthorization
        ? () => ({ [PROXY_AUTHORIZATION]: proxyAuthorization })
        : undefined
    });
    this.handshake = handshake;
    this.requestMeta = request;
  }

  override connect(
    request: Parameters<HttpProxyAgent<string>['connect']>[0],
    options: Parameters<HttpProxyAgent<string>['connect']>[1]
  ) {
    return runProxyHandshake(request, this.handshake, this.requestMeta, () =>
      super.connect(request, options)
    );
  }
}

/**
 * HTTPS 目标经 HTTP/HTTPS 代理的 CONNECT 隧道 Agent。
 *
 * 仅将 rejectUnauthorized 透传给隧道内目标 TLS 连接，保持 HTTPS 代理自身的证书校验；
 * 代理认证头仅在 CONNECT 请求中发送，握手超时或取消时立即销毁代理 socket。
 */
class SafeHttpsProxyAgent extends HttpsProxyAgent<string> {
  private readonly handshake: AbortController;
  private readonly target: SafeProxyTarget;

  constructor(
    proxyUrl: URL,
    {
      proxyAuthorization,
      ...target
    }: SafeProxyTarget & {
      proxyAuthorization?: string;
    }
  ) {
    const handshake = new AbortController();
    super(proxyUrl, {
      signal: handshake.signal,
      headers: proxyAuthorization
        ? () => ({ [PROXY_AUTHORIZATION]: proxyAuthorization })
        : undefined
    });
    this.handshake = handshake;
    this.target = target;
  }

  override connect(
    request: http.ClientRequest,
    options: Parameters<HttpsProxyAgent<string>['connect']>[1]
  ) {
    return runProxyHandshake(request, this.handshake, this.target.request, () =>
      super.connect(
        request,
        options.secureEndpoint
          ? { ...options, rejectUnauthorized: this.target.rejectUnauthorized }
          : options
      )
    );
  }
}

const ipv6ToBytes = (address: string): number[] => {
  const [left, right] = address.split('::');
  const expand = (segment: string) =>
    segment
      ? segment.split(':').flatMap((part) => {
          if (!part.includes('.')) return [parseInt(part, 16)];
          const octets = part.split('.').map(Number);
          return [(octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]];
        })
      : [];
  const leftGroups = expand(left);
  const rightGroups = right !== undefined ? expand(right) : [];
  const zeroGroups =
    right !== undefined
      ? new Array<number>(8 - leftGroups.length - rightGroups.length).fill(0)
      : [];
  return [...leftGroups, ...zeroGroups, ...rightGroups].flatMap((group) => [
    (group >> 8) & 0xff,
    group & 0xff
  ]);
};

const createSocketReader = (socket: net.Socket) => {
  let buffered: Buffer = Buffer.alloc(0);
  let closedError: Error | null = null;
  let waiting: {
    size: number;
    resolve: (chunk: Buffer) => void;
    reject: (error: Error) => void;
  } | null = null;

  const fail = (error: Error) => {
    closedError ??= error;
    if (waiting) {
      const pending = waiting;
      waiting = null;
      pending.reject(closedError);
    }
  };

  const onData = (chunk: Buffer) => {
    buffered = buffered.length === 0 ? chunk : Buffer.concat([buffered, chunk]);
    if (waiting && buffered.length >= waiting.size) {
      const pending = waiting;
      waiting = null;
      const result = buffered.subarray(0, pending.size);
      buffered = buffered.subarray(pending.size);
      pending.resolve(result);
    }
  };
  const onError = (error: Error) => fail(error);
  const onEnd = () => fail(new Error('SOCKS5 proxy closed connection during handshake'));
  const onClose = () => fail(new Error('SOCKS5 proxy socket closed during handshake'));

  socket.on('data', onData);
  socket.once('error', onError);
  socket.once('end', onEnd);
  socket.once('close', onClose);

  return {
    readExact: (size: number): Promise<Buffer> => {
      if (buffered.length >= size) {
        const result = buffered.subarray(0, size);
        buffered = buffered.subarray(size);
        return Promise.resolve(result);
      }
      if (closedError) return Promise.reject(closedError);
      return new Promise<Buffer>((resolve, reject) => {
        waiting = { size, resolve, reject };
      });
    },
    release: () => {
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      socket.removeListener('end', onEnd);
      socket.removeListener('close', onClose);
      if (buffered.length > 0) {
        socket.unshift(buffered);
        buffered = Buffer.alloc(0);
      }
    }
  };
};

/**
 * SOCKS5 代理 Agent（统一支持 socks://、socks5://、socks5h://）。
 *
 * 直接通过 net.connect({ signal }) 拥有底层代理 socket，确保协商阶段超时或取消立即销毁连接；
 * 对域名目标始终发送 ATYP=0x03 由代理侧解析 DNS，与 undici.ProxyAgent（MCP/微信）保持一致。
 */
class SafeSocks5ProxyAgent extends ProxyAgent {
  private readonly handshake: AbortController;
  private readonly proxyUrl: URL;
  private readonly target: SafeProxyTarget;

  constructor(proxyUrl: URL, target: SafeProxyTarget) {
    super();
    this.handshake = new AbortController();
    this.proxyUrl = proxyUrl;
    this.target = target;
  }

  override connect(
    request: http.ClientRequest,
    options: Parameters<ProxyAgent['connect']>[1]
  ): Promise<http.Agent> {
    return runProxyHandshake(request, this.handshake, this.target.request, async () => {
      const proxyHost = this.proxyUrl.hostname.replace(/^\[|\]$/g, '');
      const proxyPort = this.proxyUrl.port ? Number(this.proxyUrl.port) : 1080;
      const targetHost = (options.host ?? '').replace(/^\[|\]$/g, '');
      const targetPort =
        typeof options.port === 'number'
          ? options.port
          : options.port
            ? Number(options.port)
            : options.secureEndpoint
              ? 443
              : 80;
      if (!targetHost) {
        throw new TypeError('No "host" provided');
      }

      const socket = net.connect({
        host: proxyHost,
        port: proxyPort,
        signal: this.handshake.signal
      });
      const reader = createSocketReader(socket);

      try {
        await new Promise<void>((resolve, reject) => {
          const onConnect = () => {
            socket.removeListener('error', onError);
            socket.removeListener('close', onClose);
            resolve();
          };
          const onError = (error: Error) => {
            socket.removeListener('connect', onConnect);
            socket.removeListener('close', onClose);
            reject(error);
          };
          const onClose = () => {
            socket.removeListener('connect', onConnect);
            socket.removeListener('error', onError);
            reject(new Error('SOCKS5 proxy connection closed before ready'));
          };
          socket.once('connect', onConnect);
          socket.once('error', onError);
          socket.once('close', onClose);
        });

        const hasAuth = Boolean(this.proxyUrl.username || this.proxyUrl.password);
        socket.write(Buffer.from(hasAuth ? [0x05, 0x02, 0x00, 0x02] : [0x05, 0x01, 0x00]));

        const greetingReply = await reader.readExact(2);
        if (greetingReply[0] !== 0x05) {
          throw new Error(`Invalid SOCKS5 greeting version: ${greetingReply[0]}`);
        }
        if (greetingReply[1] === 0x02) {
          if (!hasAuth) {
            throw new Error('SOCKS5 proxy requires username/password authentication');
          }
          const username = Buffer.from(decodeURIComponent(this.proxyUrl.username), 'utf8');
          const password = Buffer.from(decodeURIComponent(this.proxyUrl.password), 'utf8');
          if (username.length > 255 || password.length > 255) {
            throw new Error('SOCKS5 proxy credentials exceed 255 bytes');
          }
          socket.write(
            Buffer.concat([
              Buffer.from([0x01, username.length]),
              username,
              Buffer.from([password.length]),
              password
            ])
          );
          const authReply = await reader.readExact(2);
          if (authReply[0] !== 0x01 || authReply[1] !== 0x00) {
            throw new Error(`SOCKS5 proxy authentication failed (status=${authReply[1]})`);
          }
        } else if (greetingReply[1] !== 0x00) {
          throw new Error(`SOCKS5 proxy rejected authentication method: ${greetingReply[1]}`);
        }

        const ipFamily = isIP(targetHost);
        let addrPart: Buffer;
        if (ipFamily === 4) {
          addrPart = Buffer.from([0x01, ...targetHost.split('.').map(Number)]);
        } else if (ipFamily === 6) {
          addrPart = Buffer.from([0x04, ...ipv6ToBytes(targetHost)]);
        } else {
          const domainBuf = Buffer.from(targetHost, 'utf8');
          if (domainBuf.length > 255) {
            throw new Error('SOCKS5 target hostname exceeds 255 bytes');
          }
          addrPart = Buffer.concat([Buffer.from([0x03, domainBuf.length]), domainBuf]);
        }

        const portBuf = Buffer.alloc(2);
        portBuf.writeUInt16BE(targetPort, 0);
        socket.write(Buffer.concat([Buffer.from([0x05, 0x01, 0x00]), addrPart, portBuf]));

        const connectReply = await reader.readExact(4);
        if (connectReply[0] !== 0x05) {
          throw new Error(`Invalid SOCKS5 connect reply version: ${connectReply[0]}`);
        }
        if (connectReply[1] !== 0x00) {
          throw new Error(`SOCKS5 proxy connection rejected (rep=${connectReply[1]})`);
        }

        const replyAtyp = connectReply[3];
        if (replyAtyp === 0x01) {
          await reader.readExact(4 + 2);
        } else if (replyAtyp === 0x03) {
          const [len] = await reader.readExact(1);
          await reader.readExact(len + 2);
        } else if (replyAtyp === 0x04) {
          await reader.readExact(16 + 2);
        } else {
          throw new Error(`Unsupported SOCKS5 reply address type: ${replyAtyp}`);
        }

        reader.release();

        if (options.secureEndpoint) {
          return tls.connect({
            socket,
            servername: ipFamily ? undefined : targetHost,
            rejectUnauthorized: this.target.rejectUnauthorized
          }) as unknown as http.Agent;
        }
        return socket as unknown as http.Agent;
      } catch (error) {
        reader.release();
        socket.destroy();
        throw error;
      }
    });
  }
}

const attachRequestAgent = async (
  config: SafeRedirectInternalConfig,
  requestUrl: string
): Promise<SafeRedirectInternalConfig> => {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(requestUrl);
  } catch {
    return config;
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return config;
  }

  const rawProxyUrl = resolveProxyUrl(requestUrl, config.proxy);
  const proxyUrl = rawProxyUrl ? parseSupportedOutboundProxyUrl(rawProxyUrl) : undefined;
  const rejectUnauthorized = config.__safeAxios?.rejectUnauthorized ?? true;

  // Axios 每次跳转都会重新合并默认请求头。代理认证只在首跳绑定到对应代理 origin，每跳都从目标请求移除。
  const proxyHeader = config.headers.get(PROXY_AUTHORIZATION);
  config.headers.delete(PROXY_AUTHORIZATION);
  const redirectState = config.__safeRedirect;
  if (redirectState?.count === 0 && proxyUrl && typeof proxyHeader === 'string') {
    http.validateHeaderValue(PROXY_AUTHORIZATION, proxyHeader);
    const proxyOrigin = proxyUrl.origin;
    // 凭据保存在闭包里，避免出现在 Axios 可序列化的请求配置中。
    redirectState.getProxyAuthorization = (origin) =>
      origin === proxyOrigin ? proxyHeader : undefined;
  }

  const isHttps = parsedUrl.protocol === 'https:';
  const agent = await (async () => {
    if (proxyUrl) {
      const { timeout, timeoutErrorMessage, transitional, signal, cancelToken } = config;
      const request = { timeout, timeoutErrorMessage, transitional, signal, cancelToken };
      if (isSocks5ProxyProtocol(proxyUrl.protocol)) {
        return new SafeSocks5ProxyAgent(proxyUrl, { rejectUnauthorized, request });
      }
      const proxyAuthorization = redirectState?.getProxyAuthorization?.(proxyUrl.origin);
      return isHttps
        ? new SafeHttpsProxyAgent(proxyUrl, {
            rejectUnauthorized,
            proxyAuthorization,
            request
          })
        : new SafeHttpProxyAgent(proxyUrl, {
            proxyAuthorization,
            request
          });
    }

    const resolved = await resolveSafeConnectAddress(parsedUrl.hostname);
    const lookup = createPinnedLookup(resolved);
    return isHttps ? new https.Agent({ lookup, rejectUnauthorized }) : new http.Agent({ lookup });
  })();

  return {
    ...config,
    proxy: false,
    httpAgent: isHttps ? undefined : agent,
    httpsAgent: isHttps ? agent : undefined
  };
};

const resolveSafeConnectAddress = async (hostname: string): Promise<ResolvedAddress> => {
  const normalizedHostname = hostname.replace(/^\[|\]$/g, '');
  const ipFamily = isIP(normalizedHostname);
  if (ipFamily) {
    return {
      address: normalizedHostname,
      family: ipFamily as 4 | 6
    };
  }

  const resolved = await dns.lookup(normalizedHostname, { all: true, verbatim: true });
  if (resolved.length === 0) {
    return Promise.reject(new Error('DNS lookup returned no address'));
  }

  if (resolved.some(({ address }) => isInternalResolvedIP(address))) {
    return Promise.reject(new Error(PRIVATE_URL_TEXT));
  }

  return resolved[0] as ResolvedAddress;
};

const createPinnedLookup =
  (resolved: ResolvedAddress) =>
  (_hostname: string, optionsOrCallback: unknown, maybeCallback?: LookupCallback): void => {
    const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback || {};
    const callback =
      typeof optionsOrCallback === 'function'
        ? (optionsOrCallback as LookupCallback)
        : maybeCallback;

    if (!callback) return;

    if ((options as { all?: boolean }).all) {
      callback(null, [resolved]);
      return;
    }

    callback(null, resolved.address, resolved.family);
  };

const shouldRedirect = (response: AxiosResponse): boolean =>
  REDIRECT_STATUS_CODES.has(response.status) && typeof response.headers.location === 'string';

/**
 * 按 axios baseURL + url 规则合成实际请求 URL。
 *
 * 失败时返回 undefined,保持旧拦截器对非法/非标准 URL 的宽容行为；
 * 真正的请求错误仍交给 axios 自身处理。
 */
const buildRequestUrl = (config: AxiosRequestConfig): string | undefined => {
  try {
    return new URL(config.url || '', config.baseURL).toString();
  } catch {
    return;
  }
};

/**
 * 解析 Location 头为下一跳绝对 URL,并限制协议。
 *
 * file://、gopher:// 等非 HTTP 协议不能进入后续请求流程,否则 SSRF 防护的
 * 地址策略和 axios 出站语义都会变得不明确。
 */
const resolveRedirectUrl = (location: string, currentUrl: string): string => {
  const redirectUrl = new URL(location, currentUrl);
  if (redirectUrl.protocol !== 'http:' && redirectUrl.protocol !== 'https:') {
    throw new Error(`Unsupported redirect protocol: ${redirectUrl.protocol}`);
  }
  return redirectUrl.toString();
};

/**
 * 生成重定向请求头。
 *
 * 行为对齐 follow-redirects 的安全取向:
 *  - Host 必须丢弃,由下一跳真实目标重新生成
 *  - 301/302 POST 和 303 非 GET/HEAD 转 GET 时,不能继续携带 content-* 请求体头
 *  - 跨 host/protocol 跳转时移除凭证类 header,避免用户配置的密钥被带到新域名
 */
const filterRedirectHeaders = ({
  headers,
  currentUrl,
  redirectUrl,
  shouldSwitchToGet
}: {
  headers: AxiosRequestConfig['headers'];
  currentUrl: string;
  redirectUrl: string;
  shouldSwitchToGet: boolean;
}): AxiosRequestConfig['headers'] => {
  const nextHeaders = { ...(headers as Record<string, any>) };
  const current = new URL(currentUrl);
  const redirect = new URL(redirectUrl);
  const shouldDropSensitiveHeaders =
    current.protocol !== redirect.protocol || current.host !== redirect.host;

  for (const key of Object.keys(nextHeaders)) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === 'host') {
      delete nextHeaders[key];
      continue;
    }
    if (shouldSwitchToGet && normalizedKey.startsWith('content-')) {
      delete nextHeaders[key];
      continue;
    }
    if (
      shouldDropSensitiveHeaders &&
      ['authorization', 'cookie', 'proxy-authorization'].includes(normalizedKey)
    ) {
      delete nextHeaders[key];
    }
  }

  return nextHeaders;
};

/**
 * 根据 HTTP 重定向响应构造下一跳请求配置。
 *
 * 仅实现服务端常见 301/302/303/307/308 语义:
 *  - 301/302 且原方法为 POST 时转 GET
 *  - 303 且原方法不是 GET/HEAD 时转 GET
 *  - 307/308 保留原方法和请求体
 */
const getRedirectConfig = (
  config: AxiosRequestConfig,
  response: AxiosResponse,
  currentUrl: string,
  redirectUrl: string
): AxiosRequestConfig => {
  const currentMethod = (config.method || 'get').toUpperCase();
  const shouldSwitchToGet =
    ((response.status === 301 || response.status === 302) && currentMethod === 'POST') ||
    (response.status === 303 && currentMethod !== 'GET' && currentMethod !== 'HEAD');

  return {
    ...config,
    baseURL: undefined,
    url: redirectUrl,
    maxRedirects: 0,
    method: shouldSwitchToGet ? 'GET' : config.method,
    data: shouldSwitchToGet ? undefined : config.data,
    headers: filterRedirectHeaders({
      headers: config.headers,
      currentUrl,
      redirectUrl,
      shouldSwitchToGet
    })
  };
};

/**
 * 临时放行重定向状态码,让 response interceptor 能拿到 3xx 响应并校验 Location。
 *
 * maxRedirects=0 表示调用方明确禁止跟随重定向,此时完全保留调用方 validateStatus,
 * 不把 3xx 转成“成功响应”。
 */
const getRedirectValidateStatus = (
  validateStatus: AxiosRequestConfig['validateStatus'],
  maxRedirects: number
): AxiosRequestConfig['validateStatus'] => {
  if (maxRedirects === 0) {
    return validateStatus;
  }

  return (status) => {
    if (REDIRECT_STATUS_CODES.has(status)) return true;
    return validateStatus ? validateStatus(status) : status >= 200 && status < 300;
  };
};

/**
 * 兼容旧调用方的跳过 HTTPS 证书校验专用 agent。
 *
 * safe axios 的直连路径会覆盖调用方 agent；新代码需要通过 `__safeAxios`
 * 传递受控 TLS 选项，避免自定义 agent 绕过 DNS pinning。
 */
export const httpsCertificateIgnoreAgent = createProxyAgent({
  rejectUnauthorized: false
});

/**
 * 为共享实例补充默认响应体上限。
 *
 * axios 1.18 起对 responseType=stream 也会执行 maxContentLength，而流式下载入口
 * 已经有各自的业务配额，并在消费流时限制字节数。如果把上限放在实例默认值上，
 * 会先于业务配额截断合法的附件下载（例如 Pro 渠道按团队配额允许 100 MiB）。
 * 因此这里只在调用方没有显式限制（保持 axios 默认 -1）且非流式响应时注入默认值，
 * 仍覆盖网页、OpenAPI 等会完整缓冲响应的入口。
 */
const addResponseSizeLimitInterceptor = (instance: AxiosInstance) => {
  instance.interceptors.request.use((config) => {
    // undefined 表示调用方没有提供上限（工厂会清空 axios 的 -1 默认值），
    // 以便与调用方显式传入 -1 取消限制的语义区分开。
    if (config.maxContentLength === undefined) {
      config.maxContentLength =
        config.responseType === 'stream' ? -1 : getServiceAxiosMaxContentLength();
    }
    return config;
  });

  return instance;
};

/**
 * 创建共享 axios 实例。
 *
 * 缓冲型响应默认限制解压后的响应体大小，避免请求攻击者控制的 URL 时被 gzip
 * 炸弹等高压缩比响应耗尽内存；调用方可按请求传入 maxContentLength 覆盖。
 * 流式响应保持调用方或业务层自己的配额限制。
 * 这里不限制 maxBodyLength：共享实例还承担大文件上传（文档解析、API 数据集等）。
 */
export function createProxyAxios(config?: AxiosRequestConfig, ssrfCheck = true) {
  const agent = createProxyAgent();

  const instance = isDevEnv
    ? _.create(config)
    : _.create({
        proxy: false,
        httpAgent: agent,
        httpsAgent: agent,
        ...config
      });

  // axios 自身默认 maxContentLength=-1，仅看合并后的配置无法区分“未提供”和
  // “显式取消限制”。未显式提供时清空实例默认值，交给请求拦截器按响应类型注入。
  if (typeof config?.maxContentLength !== 'number') {
    instance.defaults.maxContentLength = undefined;
  }

  const instanceWithSizeLimit = addResponseSizeLimitInterceptor(instance);

  return ssrfCheck ? addSSRFInterceptor(instanceWithSizeLimit) : instanceWithSizeLimit;
}

/** @see https://github.com/axios/axios/issues/4531 */
export const axios = createProxyAxios();
export const axiosWithoutSSRF = createProxyAxios(undefined, false);
