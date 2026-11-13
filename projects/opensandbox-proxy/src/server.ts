import { getLogger } from '@fastgpt-sdk/otel/logger';
import { createAppAuthClient, type AppAuthClient, type FetchLike } from './auth';
import type { ProxyConfig } from './env';
import { createKeepaliveTracker, type KeepaliveTracker } from './keepalive';
import { createPreviewRequestHandler, PreviewSessionCache } from './preview';
import {
  createTerminalWebSocketHandler,
  handleTerminalUpgradeRequest,
  type TerminalSocketData
} from './terminal';
import { LogCategories } from './utils/logger';

const keepaliveLogger = getLogger(LogCategories.MODULE.OPENSANDBOX_PROXY.KEEPALIVE);

export type RunningProxyServers = {
  mainServer: Bun.Server<TerminalSocketData>;
  previewServer?: Bun.Server<undefined>;
  keepalive: KeepaliveTracker;
  previewCache: PreviewSessionCache;
  stop: (closeActiveConnections?: boolean) => Promise<void>;
};

const healthResponse = (): Response =>
  new Response(JSON.stringify({ status: 'ok' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });

const notFoundResponse = (): Response =>
  new Response(JSON.stringify({ error: 'Not Found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });

const isPreviewRoute = (pathname: string): boolean =>
  pathname.startsWith('/preview/') && pathname.length > '/preview/'.length;

/**
 * 启动 `opensandbox-proxy` 边缘代理服务实例：
 * - 默认单端口模式（`PREVIEW_PORT` 未设置）：`PORT` 同时承载 `/health`、`/terminal`（WS）与 `/preview/:sessionId/*`（HTTP）；
 * - 双端口隔离模式（`PREVIEW_PORT` 已设置）：`PORT` 仅暴露 `/health` 与 `/terminal`，`PREVIEW_PORT` 仅暴露 `/health` 与 `/preview/*`，便于网关将预览流量绑定至独立不可信域名。
 */
export function startProxyServers(
  config: ProxyConfig,
  deps: {
    hostname?: string;
    authClient?: AppAuthClient;
    fetchImpl?: FetchLike;
  } = {}
): RunningProxyServers {
  const hostname = deps.hostname ?? '0.0.0.0';

  // 1. 初始化主站内部鉴权客户端、活跃续期聚合器与预览会话缓存。
  const authClient =
    deps.authClient ??
    createAppAuthClient({
      fastgptAppUrl: config.fastgptAppUrl,
      proxySecret: config.proxySecret,
      rewriteHost: config.rewriteHost,
      fetchImpl: deps.fetchImpl
    });

  const keepalive = createKeepaliveTracker({
    authClient,
    intervalMs: config.keepaliveIntervalMs,
    onError: (error) => {
      keepaliveLogger.error('Failed to report sandbox keepalive batch', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  const previewCache = new PreviewSessionCache({
    ttlMs: config.previewCacheTtlMs,
    maxEntries: config.previewCacheMaxEntries
  });

  const handlePreviewRequest = createPreviewRequestHandler({
    authClient,
    keepalive,
    cache: previewCache,
    fetchImpl: deps.fetchImpl
  });

  const splitPreviewPort = config.previewPort !== undefined;

  // 2. 启动主监听服务（始终承载 /health 与 /terminal；单端口模式下同时承载 /preview/*）。
  const mainServer = Bun.serve<TerminalSocketData>({
    hostname,
    port: config.port,
    fetch: (req, server) => {
      const url = new URL(req.url);
      if (url.pathname === '/health') {
        return healthResponse();
      }
      if (url.pathname === '/terminal') {
        return handleTerminalUpgradeRequest({
          req,
          url,
          server,
          proxySecret: config.proxySecret
        });
      }
      if (!splitPreviewPort && isPreviewRoute(url.pathname)) {
        return handlePreviewRequest(req, url);
      }
      return notFoundResponse();
    },
    websocket: createTerminalWebSocketHandler({
      authClient,
      keepalive
    })
  });

  // 3. 若配置了 PREVIEW_PORT，启动物理端口隔离的只读预览监听服务。
  const previewServer =
    config.previewPort !== undefined
      ? Bun.serve({
          hostname,
          port: config.previewPort,
          fetch: (req) => {
            const url = new URL(req.url);
            if (url.pathname === '/health') {
              return healthResponse();
            }
            if (isPreviewRoute(url.pathname)) {
              return handlePreviewRequest(req, url);
            }
            return notFoundResponse();
          }
        })
      : undefined;

  return {
    mainServer,
    previewServer,
    keepalive,
    previewCache,
    stop: async (closeActiveConnections = true) => {
      keepalive.stop();
      await Promise.all([
        previewServer?.stop(closeActiveConnections),
        mainServer.stop(closeActiveConnections)
      ]);
    }
  };
}
