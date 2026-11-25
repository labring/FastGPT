import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSandboxWsConnection,
  parseSandboxRpcMessage,
  type SandboxWsSocket
} from '@/pageComponents/chat/SandboxEditor/sandboxWsConnection';

/**
 * 这些用例直接驱动连接状态机（假 WebSocket + 假定时器），覆盖 PR #8503 审查意见
 * ①②③④⑤ 的回归：不再依赖 @testing-library/react。
 */

const WS_CONNECTING = 0;
const WS_OPEN = 1;
const WS_CLOSED = 3;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readyState = WS_CONNECTING;
  sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = WS_CLOSED;
  }

  /** 模拟代理返回 101 升级成功。 */
  open() {
    this.readyState = WS_OPEN;
    this.onopen?.({} as Event);
  }

  /** 模拟服务端推送一条消息（JSON-RPC 响应或事件）。 */
  message(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
  }

  /** 模拟对端关闭（默认 1011：代理已升级但 IDE Agent 不可达）。 */
  serverClose(code = 1011) {
    this.readyState = WS_CLOSED;
    this.onclose?.({ code, reason: '' } as CloseEvent);
  }
}

const createScheduler = () => {
  const delays: number[] = [];
  return {
    delays,
    schedule: (callback: () => void, delayMs: number) => {
      delays.push(delayMs);
      return setTimeout(callback, delayMs);
    },
    cancelSchedule: (handle: unknown) => {
      clearTimeout(handle as ReturnType<typeof setTimeout>);
    }
  };
};

const flushMicrotasks = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

const createHarness = ({
  preparing = false,
  scheduler = createScheduler(),
  getTicket = async () => ({ wsUrl: 'wss://sandbox.test/fs?ticket=secret' })
}: {
  preparing?: boolean;
  scheduler?: ReturnType<typeof createScheduler>;
  getTicket?: () => Promise<{ wsUrl: string }>;
} = {}) => {
  const calls = {
    getTicket: 0,
    recovering: 0,
    open: 0,
    connected: [] as boolean[]
  };

  const connection = createSandboxWsConnection({
    preparing,
    getTicket: () => {
      calls.getTicket += 1;
      return getTicket();
    },
    createWebSocket: (url) => new FakeWebSocket(url) as unknown as SandboxWsSocket,
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancelSchedule,
    onConnectedChange: (connected) => calls.connected.push(connected),
    onRecovering: () => {
      calls.recovering += 1;
    },
    onOpen: () => {
      calls.open += 1;
    }
  });

  return { connection, calls, scheduler };
};

/** 开一条连接并按当前应触发的延迟推进到下一次握手。 */
const openAndClose = async (
  connection: ReturnType<typeof createHarness>['connection'],
  scheduler: ReturnType<typeof createScheduler>,
  index: number
) => {
  const ws = FakeWebSocket.instances[index];
  ws.open();
  ws.serverClose();
  await vi.advanceTimersByTimeAsync(scheduler.delays[scheduler.delays.length - 1]);
  await flushMicrotasks();
};

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('sandbox WebSocket connection state machine', () => {
  it('keeps file RPCs working after the recovering notice (review ①)', async () => {
    const { connection, calls, scheduler } = createHarness();

    connection.start();
    await flushMicrotasks();
    expect(FakeWebSocket.instances).toHaveLength(1);

    // 连续 5 次断开：第 5 次后进入退避并只提示一次。
    for (let round = 0; round < 5; round++) {
      await openAndClose(connection, scheduler, round);
    }
    expect(calls.recovering).toBe(1);

    // 第 6 次握手成功并收到首个服务端消息（真正可用）。
    const recoveredWs = FakeWebSocket.instances[5];
    recoveredWs.open();
    recoveredWs.message({ jsonrpc: '2.0', method: 'fs/did_change' });

    expect(connection.getState().connected).toBe(true);
    expect(connection.getState().attempts).toBe(0);

    // 回归点 ①：恢复提示若误 reject 了新 Promise，这里会抛 “WebSocket is not connected”。
    const rpc = connection.send<{ ok: boolean }>({
      method: 'fs/read',
      params: { path: '/a.md' }
    });
    await flushMicrotasks();
    expect(recoveredWs.sent).toHaveLength(1);

    const request = JSON.parse(recoveredWs.sent[0]) as { id: number };
    recoveredWs.message({ jsonrpc: '2.0', id: request.id, result: { ok: true } });
    await expect(rpc).resolves.toEqual({ ok: true });
  });

  it('does not reset the failure counter when the proxy upgrades then closes 1011 (review ③)', async () => {
    const { connection, scheduler } = createHarness();

    connection.start();
    await flushMicrotasks();

    // 代理每轮都是先 101（onopen）再 1011 关闭，始终收不到服务端消息。
    for (let round = 0; round < 5; round++) {
      await openAndClose(connection, scheduler, round);
    }

    const sixthWs = FakeWebSocket.instances[5];
    sixthWs.open();
    sixthWs.serverClose();

    // 若在 onopen 清零计数，这里第 6 次仍会是 3000。
    expect(scheduler.delays.slice(0, 6)).toEqual([3000, 3000, 3000, 3000, 3000, 10000]);
    expect(connection.getState().attempts).toBe(6);
  });

  it('does not call getTicket while preparing and isolates an old connection failure (review ④)', async () => {
    // preparing：start() 不发起任何网络请求。
    const preparingHarness = createHarness({ preparing: true });
    preparingHarness.connection.start();
    await flushMicrotasks();
    expect(preparingHarness.calls.getTicket).toBe(0);
    expect(FakeWebSocket.instances).toHaveLength(0);
    preparingHarness.connection.stop();

    // 旧连接仍在等待 ticket 时被上层重建（stop）。
    let rejectOldTicket: (error: Error) => void = () => undefined;
    const oldTicket = new Promise<{ wsUrl: string }>((_resolve, reject) => {
      rejectOldTicket = reject;
    });
    const oldHarness = createHarness({ getTicket: () => oldTicket });
    oldHarness.connection.start();
    await flushMicrotasks();
    oldHarness.connection.stop();

    // 就绪后新连接握手成功。
    const readyHarness = createHarness();
    readyHarness.connection.start();
    await flushMicrotasks();
    const readyWs = FakeWebSocket.instances[0];
    readyWs.open();
    expect(readyHarness.connection.getState().connected).toBe(true);

    // 旧请求此时才失败：不得把新连接标记为断开，也不得重置新连接的 RPC Promise。
    rejectOldTicket(new Error('old ticket failed'));
    await flushMicrotasks();
    expect(readyHarness.connection.getState().connected).toBe(true);

    const rpc = readyHarness.connection.send<{ ok: boolean }>({
      method: 'fs/read',
      params: { path: '/b.md' }
    });
    await flushMicrotasks();
    expect(readyWs.sent).toHaveLength(1);

    const request = JSON.parse(readyWs.sent[0]) as { id: number };
    readyWs.message({ jsonrpc: '2.0', id: request.id, result: { ok: true } });
    await expect(rpc).resolves.toEqual({ ok: true });
  });

  it('reports disconnected on stop and stays disconnected until the next handshake (review ②)', async () => {
    const events: boolean[] = [];
    const scheduler = createScheduler();

    // 已连接。
    const first = createSandboxWsConnection({
      getTicket: async () => ({ wsUrl: 'wss://sandbox.test/fs?ticket=first' }),
      createWebSocket: (url) => new FakeWebSocket(url) as unknown as SandboxWsSocket,
      schedule: scheduler.schedule,
      cancelSchedule: scheduler.cancelSchedule,
      onConnectedChange: (connected) => events.push(connected)
    });
    first.start();
    await flushMicrotasks();
    FakeWebSocket.instances[0].open();
    expect(events).toEqual([true]);
    expect(first.getState().connected).toBe(true);

    // 切换 Skill 版本：旧连接 stop() 必须显式上报断开，而不是静默丢弃。
    first.stop();
    expect(events).toEqual([true, false]);
    expect(first.getState().connected).toBe(false);

    // 再次 ready（preparing 已结束）但首次 ticket 尚未返回。
    let resolveTicket: (ticket: { wsUrl: string }) => void = () => undefined;
    const pendingTicket = new Promise<{ wsUrl: string }>((resolve) => {
      resolveTicket = resolve;
    });
    const second = createSandboxWsConnection({
      getTicket: () => pendingTicket,
      createWebSocket: (url) => new FakeWebSocket(url) as unknown as SandboxWsSocket,
      schedule: scheduler.schedule,
      cancelSchedule: scheduler.cancelSchedule,
      onConnectedChange: (connected) => events.push(connected)
    });
    second.start();
    await flushMicrotasks();
    expect(events).toEqual([true, false]);
    expect(second.getState().connected).toBe(false);

    // ticket 返回、socket 已创建但尚未 onopen：仍必须是未连接。
    resolveTicket({ wsUrl: 'wss://sandbox.test/fs?ticket=second' });
    await flushMicrotasks();
    const secondWs = FakeWebSocket.instances[1];
    expect(secondWs).toBeDefined();
    expect(events).toEqual([true, false]);
    expect(second.getState().connected).toBe(false);

    // 真正握手后才恢复为已连接。
    secondWs.open();
    expect(events).toEqual([true, false, true]);
    expect(second.getState().connected).toBe(true);
  });

  it('evaluates lazy RPC params only after the handshake so paths use the current ticket (review ⑤)', async () => {
    let resolveTicket: (ticket: { wsUrl: string }) => void = () => undefined;
    const pendingTicket = new Promise<{ wsUrl: string }>((resolve) => {
      resolveTicket = resolve;
    });
    let sessionRoot = '.';

    const connection = createSandboxWsConnection({
      getTicket: () => pendingTicket,
      createWebSocket: (url) => new FakeWebSocket(url) as unknown as SandboxWsSocket,
      schedule: (callback, delayMs) => setTimeout(callback, delayMs),
      cancelSchedule: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      onTicket: () => {
        sessionRoot = 'session-1';
      }
    });

    connection.start();
    await flushMicrotasks();

    // 连接尚未建立就排队：此时会话根目录仍是初始值 '.'。
    const rpc = connection.send<{ ok: boolean }>({
      method: 'fs/read',
      params: () => ({ path: sessionRoot === '.' ? 'a.md' : `${sessionRoot}/a.md` })
    });
    await flushMicrotasks();
    expect(FakeWebSocket.instances).toHaveLength(0);

    resolveTicket({ wsUrl: 'wss://sandbox.test/fs?ticket=lazy' });
    await flushMicrotasks();
    const ws = FakeWebSocket.instances[0];
    expect(ws.sent).toHaveLength(0);

    ws.open();
    await flushMicrotasks();
    expect(ws.sent).toHaveLength(1);

    const request = JSON.parse(ws.sent[0]) as { id: number; params: { path: string } };
    // 参数在握手完成后求值，使用的是本次 ticket 的会话根目录。
    expect(request.params).toEqual({ path: 'session-1/a.md' });

    ws.message({ jsonrpc: '2.0', id: request.id, result: { ok: true } });
    await expect(rpc).resolves.toEqual({ ok: true });
  });

  it('keeps retrying after the one-time recovering notice (review ②)', async () => {
    const { connection, calls, scheduler } = createHarness();

    connection.start();
    await flushMicrotasks();

    for (let round = 0; round < 8; round++) {
      await openAndClose(connection, scheduler, round);
    }

    expect(calls.recovering).toBe(1);
    // 仍在持续重试，而不是进入“已放弃”的终态。
    expect(connection.getState().started).toBe(true);
    expect(connection.getState().connected).toBe(false);
    expect(scheduler.delays.length).toBe(8);
  });

  it('keeps the documented retry sequence: 3s x5 then 10/20/40/60s capped', async () => {
    const { connection, scheduler } = createHarness();

    connection.start();
    await flushMicrotasks();

    for (let round = 0; round < 11; round++) {
      await openAndClose(connection, scheduler, round);
    }

    expect(scheduler.delays).toEqual([
      3000, 3000, 3000, 3000, 3000, 10000, 20000, 40000, 60000, 60000, 60000
    ]);
  });
});

describe('parseSandboxRpcMessage', () => {
  it('accepts valid JSON-RPC 2.0 responses and notifications', () => {
    expect(parseSandboxRpcMessage({ jsonrpc: '2.0', id: 7, result: { ok: true } })).toEqual({
      kind: 'response',
      id: 7,
      result: { ok: true },
      error: undefined
    });
    expect(
      parseSandboxRpcMessage({ jsonrpc: '2.0', id: 8, error: { message: 'x', code: -1 } })
    ).toEqual({
      kind: 'response',
      id: 8,
      result: undefined,
      error: { message: 'x', code: -1 }
    });
    expect(parseSandboxRpcMessage({ jsonrpc: '2.0', method: 'fs/did_change' })).toEqual({
      kind: 'notification',
      method: 'fs/did_change',
      params: undefined
    });
  });

  it('rejects messages that do not satisfy the JSON-RPC 2.0 shape', () => {
    expect(parseSandboxRpcMessage(null)).toBeNull();
    expect(parseSandboxRpcMessage('fs/did_change')).toBeNull();
    expect(parseSandboxRpcMessage({ id: 1, result: {} })).toBeNull();
    expect(parseSandboxRpcMessage({ jsonrpc: '1.0', id: 1, result: {} })).toBeNull();
    expect(parseSandboxRpcMessage({ jsonrpc: '2.0', id: '1', result: {} })).toBeNull();
    expect(parseSandboxRpcMessage({ jsonrpc: '2.0', result: {} })).toBeNull();
    expect(parseSandboxRpcMessage({ jsonrpc: '2.0', id: 1, method: 42 })).toEqual({
      kind: 'response',
      id: 1,
      result: undefined,
      error: undefined
    });
    expect(parseSandboxRpcMessage({ jsonrpc: '2.0', method: 42 })).toBeNull();
  });
});
