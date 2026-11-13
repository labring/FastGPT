import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decodeExecdPtyBinaryFrameWithOffset,
  encodeExecdPtyStdinFrame,
  EXECD_PTY_BIN_STDIN,
  useInteractiveTerminal
} from '@/pageComponents/chat/SandboxEditor/components/useInteractiveTerminal';

const mocks = vi.hoisted(() => ({
  getTicket: vi.fn(),
  refresh: vi.fn(),
  write: vi.fn(),
  dispose: vi.fn(),
  fit: vi.fn(),
  onData: undefined as ((data: string) => void) | undefined,
  onResize: undefined as ((size: { cols: number; rows: number }) => void) | undefined
}));

vi.mock('@/pageComponents/chat/SandboxEditor/api', () => ({
  getSandboxTerminalTicket: mocks.getTicket
}));
vi.mock('@/pageComponents/chat/SandboxEditor/utils', () => ({
  dispatchSandboxWorkspaceRefresh: mocks.refresh
}));
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = mocks.fit;
  }
}));
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    write = mocks.write;
    dispose = mocks.dispose;
    loadAddon() {}
    open() {}
    onData(handler: typeof mocks.onData) {
      mocks.onData = handler;
      return { dispose: vi.fn() };
    }
    onResize(handler: typeof mocks.onResize) {
      mocks.onResize = handler;
      return { dispose: vi.fn() };
    }
  }
}));

/** 构造实时 stdout 二进制输出帧（`0x01` + 原始字节）。 */
function makePtyStdoutBuffer(payload: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(payload);
  const out = new Uint8Array(1 + bytes.byteLength);
  out[0] = 0x01;
  out.set(bytes, 1);
  return out.buffer;
}

/** 构造带 8 字节大端偏移量的 replay 二进制输出帧（`0x03` + uint64be + 原始字节）。 */
function makePtyReplayBuffer(payload: string, offset: number): ArrayBuffer {
  const bytes = new TextEncoder().encode(payload);
  const out = new Uint8Array(1 + 8 + bytes.byteLength);
  out[0] = 0x03;
  new DataView(out.buffer).setBigUint64(1, BigInt(offset), false);
  out.set(bytes, 9);
  return out.buffer;
}

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = MockWebSocket.CONNECTING;
  binaryType: BinaryType = 'blob';
  sent: Array<string | Uint8Array> = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string | Uint8Array) {
    this.sent.push(data);
  }

  close() {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  emitMessage(data: unknown) {
    this.onmessage?.({ data });
  }
}

describe('execd PTY binary frame codec', () => {
  it('encodes stdin (0x00) and decodes stdout/stderr (0x01/0x02) & 8-byte BE replay (0x03) frames', () => {
    const stdin = encodeExecdPtyStdinFrame('ls\n');
    expect(stdin[0]).toBe(EXECD_PTY_BIN_STDIN);
    expect(new TextDecoder().decode(stdin.subarray(1))).toBe('ls\n');

    const stdout = decodeExecdPtyBinaryFrameWithOffset(new Uint8Array([0x01, 65, 66]), 10);
    expect(stdout).toEqual({ bytes: new Uint8Array([65, 66]), nextOffset: 12 });

    const replay = decodeExecdPtyBinaryFrameWithOffset(
      new Uint8Array(makePtyReplayBuffer('ok', 1000)),
      12
    );
    expect(replay).toEqual({ bytes: new TextEncoder().encode('ok'), nextOffset: 1002 });

    expect(decodeExecdPtyBinaryFrameWithOffset(new Uint8Array(), 0)).toBeNull();
    expect(decodeExecdPtyBinaryFrameWithOffset(new Uint8Array([0x03, 0, 1]), 0)).toBeNull();
    expect(decodeExecdPtyBinaryFrameWithOffset(new Uint8Array([0xff, 1]), 0)).toBeNull();
  });
});

describe('useInteractiveTerminal WebSocket direct connection', () => {
  const sandboxTarget = { skillId: 'skill-1' };
  let dom: JSDOM;
  let root: Root;

  const TerminalTarget = () => {
    const { containerRef } = useInteractiveTerminal({ sandboxTarget, chatId: 'chat-1' });
    return React.createElement('div', { ref: containerRef });
  };

  const render = async () => {
    await act(async () => root.render(React.createElement(TerminalTarget)));
  };
  const advance = async (milliseconds: number) => {
    await act(async () => vi.advanceTimersByTimeAsync(milliseconds));
  };
  const input = async (data: string) => {
    await act(async () => mocks.onData?.(data));
    await advance(16);
  };
  const stdinPayloads = (ws: MockWebSocket) =>
    ws.sent
      .filter((item): item is Uint8Array => item instanceof Uint8Array)
      .map((frame) => {
        expect(frame[0]).toBe(0x00);
        return new TextDecoder().decode(frame.subarray(1));
      });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    MockWebSocket.instances = [];
    mocks.onData = undefined;
    mocks.onResize = undefined;
    mocks.getTicket.mockResolvedValue({
      url: 'wss://sandbox-proxy.example.com/terminal',
      ticket: 'ticket-1',
      ptySessionId: 'pty-session-1',
      reused: true
    });

    dom = new JSDOM('<!doctype html><body></body>', { url: 'https://fastgpt.example.com' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      }
    );
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('connects via ticket URL, sends 0x00 binary stdin frames and JSON resize frames', async () => {
    await render();
    expect(mocks.getTicket).toHaveBeenCalledWith({
      skillId: 'skill-1',
      chatId: 'chat-1',
      outLinkAuthData: undefined,
      cols: 80,
      rows: 24
    });
    expect(MockWebSocket.instances).toHaveLength(1);
    const ws = MockWebSocket.instances[0];
    expect(ws.url).toBe('wss://sandbox-proxy.example.com/terminal?ticket=ticket-1');

    await act(async () => ws.open());
    expect(ws.sent).toContain(JSON.stringify({ type: 'resize', cols: 80, rows: 24 }));

    await input('ls');
    await act(async () => mocks.onResize?.({ cols: 120, rows: 36 }));
    expect(stdinPayloads(ws)).toEqual(['ls']);
    expect(ws.sent).toContain(JSON.stringify({ type: 'resize', cols: 120, rows: 36 }));
  });

  it('does not poll on idle terminals and debounces workspace refresh until command output settles', async () => {
    await render();
    const ws = MockWebSocket.instances[0];
    await act(async () => ws.open());

    await act(async () => ws.emitMessage(makePtyStdoutBuffer('$ ')));
    await advance(10_000);
    expect(mocks.refresh).not.toHaveBeenCalled();

    await input('ls -la\r');
    await advance(500);
    await act(async () => ws.emitMessage(makePtyStdoutBuffer('ok\r\n')));
    await advance(500);
    expect(mocks.refresh).not.toHaveBeenCalled();
    await advance(300);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('passes since on WS URL when reusing PTY and resets offset when backend creates a new PTY (reused=false)', async () => {
    await render();
    const ws0 = MockWebSocket.instances[0];
    await act(async () => ws0.open());
    await act(async () => ws0.emitMessage(makePtyReplayBuffer('hello', 507)));

    // 1. Reconnect to same PTY (reused=true) -> WS URL carries ?since=512
    mocks.getTicket.mockResolvedValueOnce({
      url: 'wss://sandbox-proxy.example.com/terminal',
      ticket: 'ticket-2',
      ptySessionId: 'pty-session-1',
      reused: true
    });
    await act(async () => ws0.close());
    await advance(3_000);

    const ws1 = MockWebSocket.instances[1];
    expect(ws1.url).toBe('wss://sandbox-proxy.example.com/terminal?ticket=ticket-2&since=512');
    await act(async () => ws1.open());

    // 2. Reconnect when backend recreated PTY (reused=false) -> WS URL omits since
    mocks.getTicket.mockResolvedValueOnce({
      url: 'wss://sandbox-proxy.example.com/terminal',
      ticket: 'ticket-3',
      ptySessionId: 'pty-session-2',
      reused: false
    });
    await act(async () => ws1.close());
    await advance(3_000);

    const ws2 = MockWebSocket.instances[2];
    expect(ws2.url).toBe('wss://sandbox-proxy.example.com/terminal?ticket=ticket-3');
  });

  it('stops reconnecting and refreshes workspace when shell exits', async () => {
    await render();
    const ws = MockWebSocket.instances[0];
    await act(async () => ws.open());

    await act(async () => ws.emitMessage(JSON.stringify({ type: 'exit', exit_code: 0 })));
    await advance(5_000);

    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(mocks.write).toHaveBeenCalledWith(expect.stringContaining('Shell exited (code: 0)'));
  });
});
