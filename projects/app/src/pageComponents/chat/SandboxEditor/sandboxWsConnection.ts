import { createSandboxReconnectController, getSandboxWsEndpointForLog } from './reconnect';

/**
 * Sandbox WebSocket 连接状态机（与 React 解耦）。
 *
 * 由 hook 注入 `getTicket` / `createWebSocket` / `schedule` 等依赖，因此可以在没有
 * @testing-library/react 的情况下用假 WebSocket 与假定时器直接验证重连行为。
 *
 * 关键约束（对应 PR #8503 审查意见）：
 * - 恢复提示只做通知，绝不再 reject/resolve 连接 Promise（①）；
 * - 可恢复断线不上报致命错误，避免上层面板被卸载（②）；
 * - 只有 `onopen` 才把连接态置为 true，`stop()` 必须显式上报断开（②）；
 * - 不在 `onopen` 清零失败计数，代理可能先回 101 再以 1011 关闭（③）；
 * - `preparing` 下 start() 不发起任何网络请求，改由上层重建连接（④）。
 */

/** WebSocket.OPEN 的常量值；不引用全局 WebSocket，便于在 Node 测试环境运行。 */
export const SANDBOX_WS_OPEN_STATE = 1;

/** 连接所需的 ticket 最小形状（真实响应是 SandboxGetTicketResponse）。 */
export type SandboxWsTicket = {
  wsUrl: string;
};

/** WebSocket 实例的最小可注入形状，真实 `WebSocket` 结构上兼容。 */
export type SandboxWsSocket = {
  readonly readyState: number;
  send: (data: string) => void;
  close: () => void;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
};

export type SandboxWsRpcError = Error & { rpcCode?: number };

export const createSandboxWsRpcError = (message: string, rpcCode?: number): SandboxWsRpcError =>
  Object.assign(new Error(message), typeof rpcCode === 'number' ? { rpcCode } : {});

export type CreateSandboxWsConnectionOptions<TTicket extends SandboxWsTicket> = {
  getTicket: () => Promise<TTicket>;
  createWebSocket: (url: string) => SandboxWsSocket;
  /** 安排一次性回调（重连与 RPC 超时共用），便于测试注入假定时器。 */
  schedule: (callback: () => void, delayMs: number) => unknown;
  cancelSchedule: (handle: unknown) => void;
  /** 连接态变化；只在状态真正翻转时触发。 */
  onConnectedChange?: (connected: boolean) => void;
  /** 进入持续退避阶段时的提示。只允许做通知，不得影响连接 Promise。 */
  onRecovering?: () => void;
  onTicket?: (ticket: TTicket) => void;
  /** 握手成功（onopen）。注意：此时对端 Agent 可能仍不可达。 */
  onOpen?: () => void;
  /** 收到了可解析的服务端消息（已通过 JSON-RPC 类型守卫收窄）。 */
  onMessage?: (message: SandboxRpcMessage) => void;
  onHandshakeError?: (error: unknown) => void;
  onSocketError?: (event: Event, endpoint: string) => void;
  onMessageParseError?: (error: unknown) => void;
  /** 把 JSON-RPC 错误翻译成展示文案（例如磁盘配额超限走 i18n）；默认沿用服务端消息。 */
  getRpcErrorMessage?: (message: string, code?: number) => string;
  getCloseMessage?: (event: CloseEvent) => string;
  getEndpointForLog?: (wsUrl: string) => string;
  rpcTimeoutMs?: number;
  /**
   * 沙箱准备中：start() 不调用 getTicket、不建 WebSocket、不安排重连，
   * 等上层在 isPreparing 变 false 后重建连接（审查点 ④）。
   */
  preparing?: boolean;
};

export type SandboxWsConnectionState = {
  /** 只有 `onopen` 之后才为 true；`stop()`/`onclose`/握手失败都会置回 false。 */
  connected: boolean;
  attempts: number;
  started: boolean;
  preparing: boolean;
};

/** 单次 RPC 请求；`params` 可在握手完成后惰性求值，确保路径与本次连接同源（审查点 ⑤）。 */
export type SandboxWsSendRequest = {
  method: string;
  params: unknown | (() => unknown);
  timeoutMs?: number;
};

export type SandboxWsConnection = {
  start: () => void;
  stop: () => void;
  send: <T = unknown>(request: SandboxWsSendRequest) => Promise<T>;
  getState: () => SandboxWsConnectionState;
};

/** JSON-RPC 2.0 响应（有数值 id）。 */
export type SandboxRpcResponseMessage = {
  kind: 'response';
  id: number;
  result?: unknown;
  error?: { message?: string; code?: number };
};

/** JSON-RPC 2.0 通知（有字符串 method）。 */
export type SandboxRpcNotificationMessage = {
  kind: 'notification';
  method: string;
  params?: unknown;
};

export type SandboxRpcMessage = SandboxRpcResponseMessage | SandboxRpcNotificationMessage;

/**
 * 唯一的服务端消息入口：校验 JSON-RPC 版本与消息结构。
 * 不合法的消息一律返回 null，后续分支不得再自行判断 `jsonrpc`/`id`（审查点 ④）。
 */
export const parseSandboxRpcMessage = (data: unknown): SandboxRpcMessage | null => {
  if (!data || typeof data !== 'object') return null;
  const message = data as Record<string, unknown>;
  if (message.jsonrpc !== '2.0') return null;

  if (typeof message.method === 'string') {
    return { kind: 'notification', method: message.method, params: message.params };
  }

  if (typeof message.id === 'number') {
    const rawError = message.error;
    let error: SandboxRpcResponseMessage['error'];
    if (rawError && typeof rawError === 'object') {
      const value = rawError as Record<string, unknown>;
      error = {
        message: typeof value.message === 'string' ? value.message : undefined,
        code: typeof value.code === 'number' ? value.code : undefined
      };
    }
    return { kind: 'response', id: message.id, result: message.result, error };
  }

  return null;
};

type PendingRpcRequest = {
  resolve: (res: unknown) => void;
  reject: (err: unknown) => void;
};

export const createSandboxWsConnection = <TTicket extends SandboxWsTicket>({
  getTicket,
  createWebSocket,
  schedule,
  cancelSchedule,
  onConnectedChange,
  onRecovering,
  onTicket,
  onOpen,
  onMessage,
  onHandshakeError,
  onSocketError,
  onMessageParseError,
  getRpcErrorMessage = (message) => message || 'Sandbox RPC failed',
  getCloseMessage = (event) => event.reason || `WebSocket connection closed (code: ${event.code})`,
  getEndpointForLog = getSandboxWsEndpointForLog,
  rpcTimeoutMs = 30000,
  preparing = false
}: CreateSandboxWsConnectionOptions<TTicket>): SandboxWsConnection => {
  const reconnectController = createSandboxReconnectController();
  const pendingRpcRequests = new Map<number, PendingRpcRequest>();
  let nextRpcId = 1;
  let socket: SandboxWsSocket | null = null;
  let destroyed = false;
  let started = false;
  let reconnectTimer: unknown = null;
  let connectPromise: Promise<void> | null = null;
  let resolveConnect: (() => void) | null = null;
  let rejectConnect: ((error: Error) => void) | null = null;
  let connected = false;

  const resetConnectPromise = () => {
    connectPromise = new Promise<void>((resolve, reject) => {
      resolveConnect = resolve;
      rejectConnect = reject;
    });
    void connectPromise.catch(() => undefined);
  };

  const setConnected = (next: boolean) => {
    if (connected === next) return;
    connected = next;
    onConnectedChange?.(next);
  };

  const rejectPendingRpcRequests = (error: Error) => {
    pendingRpcRequests.forEach((request) => request.reject(error));
    pendingRpcRequests.clear();
  };

  const clearReconnectTimer = () => {
    if (reconnectTimer === null) return;
    cancelSchedule(reconnectTimer);
    reconnectTimer = null;
  };

  const handleRpcMessage = (message: SandboxRpcMessage) => {
    if (message.kind !== 'response') return;

    const pending = pendingRpcRequests.get(message.id);
    if (!pending) return;

    pendingRpcRequests.delete(message.id);
    if (message.error) {
      pending.reject(
        createSandboxWsRpcError(
          getRpcErrorMessage(message.error.message || '', message.error.code),
          message.error.code
        )
      );
    } else {
      pending.resolve(message.result);
    }
  };

  /**
   * 安排下一次重连：前 5 次 3s，之后指数退避并持续重试，直到成功或 stop()。
   * 审查点 ①：通知不会触碰本轮的 connect Promise —— 它已经由 onclose/catch 结算，
   * 再 reject 一次会误伤 resetConnectPromise() 新建的“下一次连接” Promise。
   */
  const scheduleReconnect = () => {
    if (destroyed || reconnectTimer !== null) return;
    const delay = reconnectController.nextDelay();
    if (reconnectController.shouldNotifyRecovering()) {
      onRecovering?.();
    }
    reconnectTimer = schedule(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
  };

  const connect = async () => {
    if (destroyed) return;
    if (!connectPromise) resetConnectPromise();

    try {
      const ticket = await getTicket();
      if (destroyed) return;
      onTicket?.(ticket);

      const ws = createWebSocket(ticket.wsUrl);
      socket = ws;

      ws.onopen = () => {
        if (destroyed || socket !== ws) {
          ws.close();
          return;
        }
        // 审查点 ③：代理先回 101 再尝试连 IDE Agent，握手成功不代表链路可用。
        // 这里只更新连接态，失败计数留给首个服务端消息（onmessage）清零。
        setConnected(true);
        resolveConnect?.();
        onOpen?.();
      };

      ws.onmessage = (event) => {
        if (destroyed || socket !== ws) return;
        let data: unknown;
        try {
          data = JSON.parse(String(event.data));
        } catch (error) {
          onMessageParseError?.(error);
          return;
        }
        // 唯一的协议入口：不合法的 JSON-RPC 消息在这里丢弃，后续分支不再判断 jsonrpc/id。
        const message = parseSandboxRpcMessage(data);
        if (!message) return;
        // 收到可解析的服务端消息说明对端确实可用：清零失败计数并允许下次中断重新提示。
        reconnectController.onOpen();
        handleRpcMessage(message);
        onMessage?.(message);
      };

      ws.onclose = (event) => {
        if (destroyed || socket !== ws) return;
        const closeError = new Error(getCloseMessage(event));

        socket = null;
        setConnected(false);

        // 先结算本轮等待，再重建给下一次连接用的 Promise；顺序不可颠倒。
        rejectConnect?.(closeError);
        resetConnectPromise();
        rejectPendingRpcRequests(closeError);

        scheduleReconnect();
      };

      ws.onerror = (event) => {
        if (destroyed || socket !== ws) return;
        onSocketError?.(event, getEndpointForLog(ticket.wsUrl));
        ws.close();
      };
    } catch (error) {
      if (destroyed) return;
      onHandshakeError?.(error);
      setConnected(false);
      rejectConnect?.(error instanceof Error ? error : new Error(String(error)));
      resetConnectPromise();
      scheduleReconnect();
    }
  };

  const send = async <T = unknown>(request: SandboxWsSendRequest): Promise<T> => {
    const { method, params, timeoutMs } = request;
    if (destroyed || preparing) {
      throw new Error('WebSocket is not connected');
    }
    if (!connectPromise) resetConnectPromise();
    await connectPromise;

    const currentWs = socket;
    if (!currentWs || currentWs.readyState !== SANDBOX_WS_OPEN_STATE) {
      throw new Error('WebSocket is not connected');
    }

    // 审查点 ⑤：握手完成后才求值惰性参数，保证路径使用的是本次连接 ticket 的会话根目录。
    const resolvedParams = typeof params === 'function' ? (params as () => unknown)() : params;

    const id = nextRpcId++;
    const promise = new Promise<T>((resolve, reject) => {
      const timer = schedule(() => {
        pendingRpcRequests.delete(id);
        reject(new Error(`Sandbox RPC timeout: ${method}`));
      }, timeoutMs ?? rpcTimeoutMs);

      pendingRpcRequests.set(id, {
        resolve: (res) => {
          cancelSchedule(timer);
          resolve(res as T);
        },
        reject: (err) => {
          cancelSchedule(timer);
          reject(err);
        }
      });
    });

    try {
      currentWs.send(JSON.stringify({ jsonrpc: '2.0', id, method, params: resolvedParams }));
    } catch (error) {
      pendingRpcRequests.get(id)?.reject(error);
      pendingRpcRequests.delete(id);
      throw error;
    }

    return promise;
  };

  const start = () => {
    if (started || destroyed) return;
    started = true;
    // 审查点 ④：准备中不发起任何网络请求（getTicket 会启动沙箱并创建目录），
    // 等上层在 isPreparing 变 false 后重建连接再握手。
    if (preparing) return;
    void connect();
  };

  const stop = () => {
    if (destroyed) return;
    destroyed = true;
    clearReconnectTimer();

    if (socket) {
      const ws = socket;
      socket = null;
      ws.close();
    }

    // 审查点 ②：旧连接被丢弃时必须显式上报断开，否则上层会沿用 “已连接” 的旧值，
    // 在新 ticket 尚未返回、握手未完成时提前放开文件区加载态与终端入口。
    setConnected(false);

    const closeError = new Error('WebSocket connection closed');
    rejectConnect?.(closeError);
    rejectPendingRpcRequests(closeError);
  };

  return {
    start,
    stop,
    send,
    getState: () => ({
      connected,
      attempts: reconnectController.getAttempts(),
      started,
      preparing
    })
  };
};
