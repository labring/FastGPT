import { getLogger } from '@fastgpt-sdk/otel/logger';
import { verifyHs256JwtTicket, type AppAuthClient } from './auth';
import type { KeepaliveTracker } from './keepalive';
import { LogCategories } from './utils/logger';

const logger = getLogger(LogCategories.MODULE.OPENSANDBOX_PROXY.TERMINAL);

/** 上游 `execd` WebSocket 完成建连前允许暂存的最大客户端帧数与总字节上限，防止慢速握手期间内存膨胀。 */
const MAX_PENDING_FRAMES = 64;
const MAX_PENDING_BYTES = 64 * 1024;
export const TERMINAL_MAX_PAYLOAD_BYTES = 1024 * 1024;
export const TERMINAL_BACKPRESSURE_LIMIT_BYTES = 8 * 1024 * 1024;

type PendingFrame = string | Uint8Array<ArrayBuffer>;

export type TerminalSocketData = {
  kind: 'terminal';
  ticket: string;
  requestedSince: number;
  closed: boolean;
  upstream?: WebSocket;
  pendingFrames: PendingFrame[];
  pendingBytes: number;
  releaseKeepalive?: () => void;
};

/**
 * 将 `execd` HTTP 基地址转换为 `/pty/<id>/ws` WebSocket 地址：
 * - 保留 OpenSandbox Server Proxy 网关路径前缀（如 `/v1/sandboxes/<id>/proxy/44772`）；
 * - 固定附加 `takeover=1` 接管会话输出流，并附带 `since` 字节偏移游标实现断线增量补齐。
 */
export function buildUpstreamPtyWsUrl(params: {
  execdBaseUrl: string;
  ptySessionId: string;
  since: number;
}): string {
  const parsed = new URL(params.execdBaseUrl);
  if (parsed.protocol === 'https:') {
    parsed.protocol = 'wss:';
  } else if (parsed.protocol === 'http:') {
    parsed.protocol = 'ws:';
  }
  parsed.pathname = `${parsed.pathname.replace(/\/+$/, '')}/pty/${encodeURIComponent(params.ptySessionId)}/ws`;
  parsed.search = '';
  parsed.hash = '';
  parsed.searchParams.set('takeover', '1');
  parsed.searchParams.set('since', String(Math.max(0, Math.floor(params.since))));
  return parsed.toString();
}

const getFrameByteLength = (frame: PendingFrame): number =>
  typeof frame === 'string' ? Buffer.byteLength(frame, 'utf8') : frame.byteLength;

const jsonErrorResponse = (status: number, error: string): Response =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });

/**
 * 在 HTTP Upgrade 阶段执行边缘预检并升级为终端 WebSocket 连接：
 * 1. 仅允许 `GET` 方法；
 * 2. 本地校验 HS256 JWT Ticket 签名与有效期，未通过直接返回 `401`（不请求主站）；
 * 3. 校验 `since` 非负整数游标，通过后升级为 `Bun.ServerWebSocket`。
 */
export function handleTerminalUpgradeRequest(params: {
  req: Request;
  url: URL;
  server: Bun.Server<TerminalSocketData>;
  proxySecret: string;
}): Response | undefined {
  const { req, url, server, proxySecret } = params;
  if (req.method !== 'GET') {
    return jsonErrorResponse(405, 'Method Not Allowed');
  }

  // 1. 边缘本地验签，拦截过期或伪造票据。
  const ticket = url.searchParams.get('ticket')?.trim() ?? '';
  const precheck = verifyHs256JwtTicket({ ticket, secret: proxySecret });
  if (!precheck.ok) {
    return jsonErrorResponse(401, `Unauthorized terminal ticket: ${precheck.reason}`);
  }

  // 2. 校验断线重连字节游标 since。
  const rawSince = url.searchParams.get('since')?.trim() ?? '';
  const requestedSince = (() => {
    if (rawSince === '') return 0;
    const parsed = Number(rawSince);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : -1;
  })();
  if (requestedSince < 0) {
    return jsonErrorResponse(400, 'Invalid since offset');
  }

  // 3. 升级协议并初始化每个连接的隔离状态。
  const upgraded = server.upgrade(req, {
    data: {
      kind: 'terminal',
      ticket,
      requestedSince,
      closed: false,
      pendingFrames: [],
      pendingBytes: 0
    }
  });

  if (!upgraded) {
    return jsonErrorResponse(400, 'WebSocket upgrade required');
  }
  return undefined;
}

/**
 * 创建 `Bun.serve` 终端 WebSocket 处理器，负责与沙盒内 `execd` `/pty/<id>/ws` 建立双向 1:1 原生帧透传。
 */
export function createTerminalWebSocketHandler(params: {
  authClient: Pick<AppAuthClient, 'verifyTerminalTicket'>;
  keepalive: Pick<KeepaliveTracker, 'acquire'>;
}): Bun.WebSocketHandler<TerminalSocketData> {
  const { authClient, keepalive } = params;

  /**
   * 幂等释放单个终端连接关联的预连接缓冲队列、保活引用计数、上游 WebSocket 与下游客户端连接。
   */
  const cleanupSession = (
    ws: Bun.ServerWebSocket<TerminalSocketData>,
    options: { closeDownstream?: boolean; closeCode?: number; closeReason?: string } = {}
  ) => {
    const state = ws.data;
    if (state.closed) {
      return;
    }
    state.closed = true;
    state.pendingFrames.length = 0;
    state.pendingBytes = 0;
    state.releaseKeepalive?.();
    state.releaseKeepalive = undefined;

    const upstream = state.upstream;
    state.upstream = undefined;
    if (
      upstream &&
      (upstream.readyState === WebSocket.CONNECTING || upstream.readyState === WebSocket.OPEN)
    ) {
      try {
        upstream.close(1000, 'Proxy session closed');
      } catch {}
    }

    if (options.closeDownstream === true) {
      try {
        ws.close(options.closeCode ?? 1000, options.closeReason ?? 'Session closed');
      } catch {}
    }
  };

  /**
   * 向下游关联的上游 `execd` WebSocket 发送帧；若上游发送缓冲区超出背压阈值则立即熔断关闭会话。
   */
  const forwardFrameToUpstream = (options: {
    ws: Bun.ServerWebSocket<TerminalSocketData>;
    upstream: WebSocket;
    frame: PendingFrame;
  }): boolean => {
    const { ws, upstream, frame } = options;
    const frameBytes = getFrameByteLength(frame);
    if (upstream.bufferedAmount + frameBytes > TERMINAL_BACKPRESSURE_LIMIT_BYTES) {
      cleanupSession(ws, {
        closeDownstream: true,
        closeCode: 1008,
        closeReason: 'Upstream backpressure limit exceeded'
      });
      return false;
    }
    upstream.send(frame);
    return true;
  };

  return {
    maxPayloadLength: TERMINAL_MAX_PAYLOAD_BYTES,
    idleTimeout: 120,
    backpressureLimit: TERMINAL_BACKPRESSURE_LIMIT_BYTES,
    closeOnBackpressureLimit: true,

    open: async (ws) => {
      const state = ws.data;

      // 1. 回调主站二次核验票据并唤醒/确保目标沙盒与 PTY 会话就绪，获取上游连接地址与鉴权请求头。
      let verified: Awaited<ReturnType<typeof authClient.verifyTerminalTicket>>;
      try {
        verified = await authClient.verifyTerminalTicket(state.ticket);
      } catch (error) {
        if (!state.closed) {
          const message = error instanceof Error ? error.message : 'Ticket verification failed';
          logger.warn('Terminal ticket verification failed', { error: message });
          try {
            ws.send(JSON.stringify({ type: 'error', error: message }));
          } catch {}
          cleanupSession(ws, {
            closeDownstream: true,
            closeCode: 1008,
            closeReason: 'Ticket verification failed'
          });
        }
        return;
      }

      if (state.closed) {
        return;
      }

      // 2. 仅在复用同一活跃 PTY 会话时沿用客户端 since 游标；若沙盒刚休眠唤醒重建了新 PTY（reused=false），游标必须归零。
      const effectiveSince = verified.reused ? state.requestedSince : 0;
      const upstreamUrl = buildUpstreamPtyWsUrl({
        execdBaseUrl: verified.execdBaseUrl,
        ptySessionId: verified.ptySessionId,
        since: effectiveSince
      });

      let upstream: WebSocket;
      try {
        upstream = new WebSocket(upstreamUrl, {
          headers: verified.execdHeaders
        });
        upstream.binaryType = 'arraybuffer';
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to connect upstream terminal';
        logger.error('Failed to initialize upstream terminal WebSocket', {
          sandboxId: verified.sandboxId,
          error: message
        });
        try {
          ws.send(JSON.stringify({ type: 'error', error: message }));
        } catch {}
        cleanupSession(ws, {
          closeDownstream: true,
          closeCode: 1011,
          closeReason: 'Upstream connection failed'
        });
        return;
      }

      state.upstream = upstream;
      state.releaseKeepalive = keepalive.acquire(verified.sandboxId);

      // 3. 上游握手成功后：若本次因容器重建将非零 since 重置为 0，先通知浏览器重置本地 lastOffset，再冲刷预连接缓冲帧。
      upstream.onopen = () => {
        if (state.closed) {
          try {
            upstream.close();
          } catch {}
          return;
        }

        if (!verified.reused && state.requestedSince > 0) {
          try {
            ws.send(JSON.stringify({ type: 'offset', offset: 0 }));
          } catch {}
        }

        while (state.pendingFrames.length > 0) {
          const nextFrame = state.pendingFrames.shift();
          if (nextFrame !== undefined) {
            state.pendingBytes -= getFrameByteLength(nextFrame);
            if (!forwardFrameToUpstream({ ws, upstream, frame: nextFrame })) {
              return;
            }
          }
        }
      };

      // 4. 透传上游文本控制帧与二进制终端输出帧。
      // 注意：Bun 的 `ws.send()` 在发送合法 0 字节二进制帧时返回值也为 0，因此不能用 `<= 0` 误判断开；
      // 下游背压超限交由 `closeOnBackpressureLimit` 处理，连接关闭交由 `close` 回调统一清理。
      upstream.onmessage = (event) => {
        if (state.closed) {
          return;
        }
        const payload = event.data;
        if (typeof payload === 'string') {
          ws.send(payload);
        } else if (payload instanceof ArrayBuffer) {
          ws.send(new Uint8Array(payload));
        }
      };

      upstream.onerror = () => {
        if (state.closed) {
          return;
        }
        logger.warn('Upstream terminal WebSocket error', { sandboxId: verified.sandboxId });
        try {
          ws.send(JSON.stringify({ type: 'error', error: 'Upstream terminal WebSocket error' }));
        } catch {}
        cleanupSession(ws, {
          closeDownstream: true,
          closeCode: 1011,
          closeReason: 'Upstream terminal error'
        });
      };

      upstream.onclose = (event) => {
        if (state.closed) {
          return;
        }
        // RFC 6455 禁止应用层主动发送 1005/1006 等保留状态码，需规整为合法关闭码后再转发给浏览器。
        const code =
          event.code >= 1000 && event.code <= 4999 && event.code !== 1005 && event.code !== 1006
            ? event.code
            : 1000;
        cleanupSession(ws, {
          closeDownstream: true,
          closeCode: code,
          closeReason: event.reason || 'Upstream closed'
        });
      };
    },

    message: (ws, message) => {
      const state = ws.data;
      if (state.closed) {
        return;
      }

      const normalizedFrame: PendingFrame = (() => {
        if (typeof message === 'string') {
          return message;
        }
        // 独立拷贝帧字节，避免在异步握手排队期间持有 Bun 底层共享接收缓冲区的引用。
        const copy = new Uint8Array(message.byteLength);
        copy.set(new Uint8Array(message.buffer, message.byteOffset, message.byteLength));
        return copy;
      })();

      const upstream = state.upstream;
      if (upstream && upstream.readyState === WebSocket.OPEN) {
        forwardFrameToUpstream({ ws, upstream, frame: normalizedFrame });
        return;
      }

      // 上游握手未完成前（如客户端连接建立后立即发送初始 resize 帧）暂存有界队列，超限直接熔断防内存滥用。
      const byteLength = getFrameByteLength(normalizedFrame);
      if (
        state.pendingFrames.length >= MAX_PENDING_FRAMES ||
        state.pendingBytes + byteLength > MAX_PENDING_BYTES
      ) {
        cleanupSession(ws, {
          closeDownstream: true,
          closeCode: 1009,
          closeReason: 'Pre-connect frame buffer exceeded'
        });
        return;
      }
      state.pendingFrames.push(normalizedFrame);
      state.pendingBytes += byteLength;
    },

    close: (ws) => {
      cleanupSession(ws, { closeDownstream: false });
    }
  };
}
