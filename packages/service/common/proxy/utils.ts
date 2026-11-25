import { AxiosError, CanceledError, type AxiosRequestConfig } from 'axios';
import { Agent as AgentBase, type AgentConnectOpts } from 'agent-base';
import type http from 'http';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import net, { isIP } from 'net';
import { SocksClient, type SocksProxy } from 'socks';
import tls from 'tls';
import { ProxyAgent as UndiciProxyAgent } from 'undici';

export const DEFAULT_PROXY_CONNECT_TIMEOUT_MS = 30_000;
export const PROXY_AUTHORIZATION_HEADER = 'Proxy-Authorization';

const SUPPORTED_HTTP_PROXY_PROTOCOLS = new Set(['http:', 'https:']);
const SUPPORTED_SOCKS5_PROXY_PROTOCOLS = new Set(['socks:', 'socks5:', 'socks5h:']);

export type OutboundProxyRequestMeta = Pick<
  AxiosRequestConfig,
  'timeout' | 'timeoutErrorMessage' | 'transitional' | 'signal' | 'cancelToken'
>;

export const isHttpProxyProtocol = (protocol: string): boolean =>
  SUPPORTED_HTTP_PROXY_PROTOCOLS.has(protocol);

export const isSocks5ProxyProtocol = (protocol: string): boolean =>
  SUPPORTED_SOCKS5_PROXY_PROTOCOLS.has(protocol);

/**
 * 解析并校验受支持的出站代理 URL。
 *
 * 统一支持 http: / https: / socks: / socks5: / socks5h:，且全部采用代理侧 DNS 解析语义，
 * 保证共享 Axios、MCP、微信个人号及团队模型自定义端点在无目标 DNS 的隔离环境中可使用同一代理配置。
 */
export const parseSupportedOutboundProxyUrl = (proxyUrl: string | URL): URL => {
  const parsed = proxyUrl instanceof URL ? new URL(proxyUrl.href) : new URL(proxyUrl);
  if (!isHttpProxyProtocol(parsed.protocol) && !isSocks5ProxyProtocol(parsed.protocol)) {
    throw new Error(
      `Unsupported outbound proxy protocol: ${parsed.protocol} (supported: http, https, socks, socks5, socks5h)`
    );
  }
  return parsed;
};

/**
 * 为 undici 客户端构造统一的出站 ProxyAgent。
 *
 * undici 的 Socks5ProxyAgent 始终由代理侧解析目标域名，但仅接受 socks:/socks5: 协议名；
 * 这里将 socks5h: 归一化为 socks5:，使各端对 socks5:// 与 socks5h:// 保持一致语义。
 */
export const createUndiciOutboundProxyAgent = (proxyUrl: string | URL): UndiciProxyAgent => {
  const parsed = parseSupportedOutboundProxyUrl(proxyUrl);
  const normalizedUri =
    parsed.protocol === 'socks5h:' ? parsed.href.replace(/^socks5h:/i, 'socks5:') : parsed.href;
  return new UndiciProxyAgent({ uri: normalizedUri, proxyTunnel: false });
};

/**
 * 构造隧道内目标 TLS 的身份校验选项。
 *
 * - 域名目标：携带原始域名作为 SNI 并按域名校验 SAN；
 * - IP 字面量目标：按 RFC 6066 省略 SNI（空串），同时显式通过 checkServerIdentity 校验目标 IP SAN，
 *   避免 Node 在省略 servername 时错误按默认 localhost 校验导致合法 IP SAN 证书被拒。
 */
const buildTargetTlsOptions = ({
  targetHost,
  rejectUnauthorized
}: {
  targetHost: string;
  rejectUnauthorized: boolean;
}) => ({
  servername: isIP(targetHost) ? '' : targetHost,
  rejectUnauthorized,
  checkServerIdentity: (
    _hostname: string,
    certificate: Parameters<typeof tls.checkServerIdentity>[1]
  ) => tls.checkServerIdentity(targetHost, certificate)
});

/**
 * 在代理握手阶段统一绑定超时（默认 30s）、取消信号和请求关闭事件，
 * 确保任意阶段超时或取消都能通过 AbortController 销毁底层代理 socket。
 */
const runProxyHandshake = async <T>({
  request,
  handshake,
  requestMeta,
  connect
}: {
  request: http.ClientRequest;
  handshake: AbortController;
  requestMeta: OutboundProxyRequestMeta;
  connect: () => Promise<T>;
}): Promise<T> => {
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
    return await connect();
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
class AbortableHttpProxyAgent extends HttpProxyAgent<string> {
  private readonly handshake: AbortController;
  private readonly requestMeta: OutboundProxyRequestMeta;

  constructor(
    proxyUrl: URL,
    {
      proxyAuthorization,
      request
    }: {
      proxyAuthorization?: string;
      request: OutboundProxyRequestMeta;
    }
  ) {
    const handshake = new AbortController();
    super(proxyUrl, {
      signal: handshake.signal,
      headers: proxyAuthorization
        ? () => ({ [PROXY_AUTHORIZATION_HEADER]: proxyAuthorization })
        : undefined
    });
    this.handshake = handshake;
    this.requestMeta = request;
  }

  override connect(
    request: Parameters<HttpProxyAgent<string>['connect']>[0],
    options: Parameters<HttpProxyAgent<string>['connect']>[1]
  ) {
    return runProxyHandshake({
      request,
      handshake: this.handshake,
      requestMeta: this.requestMeta,
      connect: () => super.connect(request, options)
    });
  }
}

/**
 * HTTPS 目标经 HTTP/HTTPS 代理的 CONNECT 隧道 Agent。
 *
 * 仅将目标 TLS 校验选项透传给隧道内目标连接，保持 HTTPS 代理自身的证书校验；
 * 代理认证头仅在 CONNECT 握手阶段发送，超时或取消时立即销毁代理 socket。
 */
class AbortableHttpsProxyAgent extends HttpsProxyAgent<string> {
  private readonly handshake: AbortController;
  private readonly rejectUnauthorized: boolean;
  private readonly requestMeta: OutboundProxyRequestMeta;

  constructor(
    proxyUrl: URL,
    {
      rejectUnauthorized,
      proxyAuthorization,
      request
    }: {
      rejectUnauthorized: boolean;
      proxyAuthorization?: string;
      request: OutboundProxyRequestMeta;
    }
  ) {
    const handshake = new AbortController();
    super(proxyUrl, {
      signal: handshake.signal,
      headers: proxyAuthorization
        ? () => ({ [PROXY_AUTHORIZATION_HEADER]: proxyAuthorization })
        : undefined
    });
    this.handshake = handshake;
    this.rejectUnauthorized = rejectUnauthorized;
    this.requestMeta = request;
  }

  override connect(
    request: http.ClientRequest,
    options: Parameters<HttpsProxyAgent<string>['connect']>[1]
  ) {
    return runProxyHandshake({
      request,
      handshake: this.handshake,
      requestMeta: this.requestMeta,
      connect: () => {
        if (!options.secureEndpoint) {
          return super.connect(request, options);
        }
        const targetHost = (options.host ?? '').replace(/^\[|\]$/g, '');
        return super.connect(request, {
          ...options,
          ...buildTargetTlsOptions({
            targetHost,
            rejectUnauthorized: this.rejectUnauthorized
          })
        });
      }
    });
  }
}

/**
 * SOCKS5 代理 Agent（统一支持 socks://、socks5://、socks5h://）。
 *
 * 通过 net.connect({ signal }) 持有可即时取消的底层代理 socket，并将其作为 existing_socket
 * 交给 socks 库的 SocksClient 完成协商（域名始终由 SOCKS5 代理侧解析，不做本机 DNS 查询）。
 */
class AbortableSocks5ProxyAgent extends AgentBase {
  private readonly handshake: AbortController;
  private readonly proxyUrl: URL;
  private readonly rejectUnauthorized: boolean;
  private readonly requestMeta: OutboundProxyRequestMeta;

  constructor(
    proxyUrl: URL,
    {
      rejectUnauthorized,
      request
    }: {
      rejectUnauthorized: boolean;
      request: OutboundProxyRequestMeta;
    }
  ) {
    super();
    this.handshake = new AbortController();
    this.proxyUrl = proxyUrl;
    this.rejectUnauthorized = rejectUnauthorized;
    this.requestMeta = request;
  }

  override connect(request: http.ClientRequest, options: AgentConnectOpts): Promise<net.Socket> {
    return runProxyHandshake({
      request,
      handshake: this.handshake,
      requestMeta: this.requestMeta,
      connect: async () => {
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

        // 1. 先建立由 handshake.signal 控制的底层代理 socket，确保协商期间取消/超时可立即释放连接。
        const rawSocket = net.connect({
          host: proxyHost,
          port: proxyPort,
          signal: this.handshake.signal
        });

        try {
          await new Promise<void>((resolve, reject) => {
            const onConnect = () => {
              rawSocket.removeListener('error', onError);
              rawSocket.removeListener('close', onClose);
              resolve();
            };
            const onError = (error: Error) => {
              rawSocket.removeListener('connect', onConnect);
              rawSocket.removeListener('close', onClose);
              reject(error);
            };
            const onClose = () => {
              rawSocket.removeListener('connect', onConnect);
              rawSocket.removeListener('error', onError);
              reject(new Error('SOCKS5 proxy connection closed before ready'));
            };
            rawSocket.once('connect', onConnect);
            rawSocket.once('error', onError);
            rawSocket.once('close', onClose);
          });

          // 2. 复用 socks 库在 existing_socket 上完成 SOCKS5 认证与 CONNECT 协商（代理侧解析域名）。
          const proxy: SocksProxy = {
            host: proxyHost,
            port: proxyPort,
            type: 5,
            ...(this.proxyUrl.username
              ? { userId: decodeURIComponent(this.proxyUrl.username) }
              : {}),
            ...(this.proxyUrl.password
              ? { password: decodeURIComponent(this.proxyUrl.password) }
              : {})
          };
          const timeout = this.requestMeta.timeout ?? 0;
          const handshakeTimeout = timeout > 0 ? timeout : DEFAULT_PROXY_CONNECT_TIMEOUT_MS;
          const { socket: socksSocket } = await SocksClient.createConnection({
            existing_socket: rawSocket,
            command: 'connect',
            proxy,
            destination: { host: targetHost, port: targetPort },
            timeout: handshakeTimeout
          });

          // 3. HTTPS 目标在隧道上升级 TLS，统一处理域名 SNI 与 IP 字面量 SAN 校验。
          if (options.secureEndpoint) {
            const {
              host: _host,
              port: _port,
              path: _path,
              lookup: _lookup,
              ...tlsOptions
            } = options;
            return tls.connect({
              ...tlsOptions,
              socket: socksSocket,
              ...buildTargetTlsOptions({
                targetHost,
                rejectUnauthorized: this.rejectUnauthorized
              })
            });
          }

          return socksSocket;
        } catch (error) {
          rawSocket.destroy();
          throw error;
        }
      }
    });
  }
}

/**
 * 为 Node http/https 客户端（共享 Axios）构造统一的出站代理 Agent。
 */
export const createNodeOutboundProxyAgent = ({
  proxyUrl,
  isHttps,
  rejectUnauthorized,
  proxyAuthorization,
  request
}: {
  proxyUrl: URL;
  isHttps: boolean;
  rejectUnauthorized: boolean;
  proxyAuthorization?: string;
  request: OutboundProxyRequestMeta;
}): http.Agent => {
  const normalizedUrl = parseSupportedOutboundProxyUrl(proxyUrl);

  if (isSocks5ProxyProtocol(normalizedUrl.protocol)) {
    return new AbortableSocks5ProxyAgent(normalizedUrl, {
      rejectUnauthorized,
      request
    });
  }

  return isHttps
    ? new AbortableHttpsProxyAgent(normalizedUrl, {
        rejectUnauthorized,
        proxyAuthorization,
        request
      })
    : new AbortableHttpProxyAgent(normalizedUrl, {
        proxyAuthorization,
        request
      });
};
