import { useEffect, useRef } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import type { ChatTargetInputType } from '@fastgpt/global/openapi/core/chat/api';
import { getSandboxTerminalTicket } from '../api';
import { dispatchSandboxWorkspaceRefresh } from '../utils';
import { getSandboxTargetId } from '../types';

export const EXECD_PTY_BIN_STDIN = 0x00;
export const EXECD_PTY_BIN_STDOUT = 0x01;
export const EXECD_PTY_BIN_STDERR = 0x02;
export const EXECD_PTY_BIN_REPLAY = 0x03;

/**
 * 将终端字符串编码为 OpenSandbox `execd` PTY WebSocket 输入帧（`0x00` + UTF-8 字节）。
 */
export function encodeExecdPtyStdinFrame(input: string): Uint8Array<ArrayBuffer> {
  const bytes = new TextEncoder().encode(input);
  const frame = new Uint8Array(1 + bytes.byteLength);
  frame[0] = EXECD_PTY_BIN_STDIN;
  frame.set(bytes, 1);
  return frame;
}

/**
 * 解码 OpenSandbox `execd` PTY WebSocket 输出二进制帧并推进断线续传字节偏移量 `since`：
 * - `0x01` / `0x02`：实时 stdout/stderr 帧，`nextOffset = currentOffset + payload.byteLength`；
 * - `0x03`：断线重放帧，`[1..9]` 为大端 uint64 起始字节偏移量，`nextOffset = replayStart + payload.byteLength`。
 */
export function decodeExecdPtyBinaryFrameWithOffset(
  data: Uint8Array,
  currentOffset: number
): { bytes: Uint8Array; nextOffset: number } | null {
  if (data.byteLength === 0) {
    return null;
  }

  const tag = data[0];
  if (tag === EXECD_PTY_BIN_STDOUT || tag === EXECD_PTY_BIN_STDERR) {
    const bytes = data.subarray(1);
    return {
      bytes,
      nextOffset: currentOffset + bytes.byteLength
    };
  }

  if (tag === EXECD_PTY_BIN_REPLAY) {
    if (data.byteLength < 9) {
      return null;
    }
    const view = new DataView(data.buffer, data.byteOffset + 1, 8);
    const replayStart = Number(view.getBigUint64(0, false));
    const bytes = data.subarray(9);
    return {
      bytes,
      nextOffset: replayStart + bytes.byteLength
    };
  }

  return null;
}

type UseTerminalProps = {
  sandboxTarget: ChatTargetInputType;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
  canWrite?: boolean;
};

const MAX_RECONNECT_ATTEMPTS = 3;
const STABLE_CONNECTION_MS = 2_000;
const WORKSPACE_REFRESH_DEBOUNCE_MS = 800;
const HEARTBEAT_PING_INTERVAL_MS = 25_000;

/**
 * 交互式终端 Hook：先向主站申请短期 Ticket，再通过浏览器原生 WebSocket 直连 `opensandbox-proxy`，
 * 直接收发 OpenSandbox `execd` 二进制帧（`0x00~0x03`）与 JSON 控制帧，支持 `since` 断线无损续传。
 */
export const useInteractiveTerminal = ({
  sandboxTarget,
  chatId,
  outLinkAuthData,
  canWrite = true
}: UseTerminalProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sandboxTargetId = getSandboxTargetId(sandboxTarget);

  useEffect(() => {
    if (!containerRef.current || !sandboxTargetId || !chatId) {
      return;
    }

    let isDestroyed = false;
    let connectGeneration = 0;
    let activeSocket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stableConnectionTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let refreshWorkspaceTimer: ReturnType<typeof setTimeout> | null = null;
    let flushInputTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingCommandRefresh = false;
    let reconnectCount = 0;
    let connectedPtySessionId = '';
    let lastOffset = 0;
    let inputBuffer = '';

    const scheduleWorkspaceRefresh = () => {
      if (isDestroyed) {
        return;
      }
      if (refreshWorkspaceTimer) {
        clearTimeout(refreshWorkspaceTimer);
      }
      refreshWorkspaceTimer = setTimeout(() => {
        refreshWorkspaceTimer = null;
        pendingCommandRefresh = false;
        if (!isDestroyed) {
          dispatchSandboxWorkspaceRefresh();
        }
      }, WORKSPACE_REFRESH_DEBOUNCE_MS);
    };

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: '"JetBrains Mono", Menlo, Monaco, Consolas, "Courier New", monospace',
      lineHeight: 1.3,
      theme: {
        background: '#ffffff',
        foreground: '#1d2532',
        cursor: '#485264',
        cursorAccent: '#ffffff',
        selectionBackground: 'rgba(29, 37, 50, 0.15)',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5'
      }
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    if (!canWrite) {
      term.write('\r\n\x1b[1;31mTerminal requires write permission.\x1b[0m\r\n');
      return () => {
        term.dispose();
      };
    }

    const clearConnectionState = () => {
      inputBuffer = '';
      pendingCommandRefresh = false;
      if (flushInputTimer) {
        clearTimeout(flushInputTimer);
        flushInputTimer = null;
      }
      if (stableConnectionTimer) {
        clearTimeout(stableConnectionTimer);
        stableConnectionTimer = null;
      }
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      const ws = activeSocket;
      activeSocket = null;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        try {
          ws.close(1000, 'Client reset');
        } catch {}
      }
    };

    const sendResize = (cols: number, rows: number) => {
      if (
        !activeSocket ||
        activeSocket.readyState !== WebSocket.OPEN ||
        !Number.isFinite(cols) ||
        !Number.isFinite(rows) ||
        cols <= 0 ||
        rows <= 0
      ) {
        return;
      }
      activeSocket.send(JSON.stringify({ type: 'resize', cols, rows }));
    };

    const flushStdin = () => {
      flushInputTimer = null;
      if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN || inputBuffer === '') {
        return;
      }
      const chunk = inputBuffer;
      inputBuffer = '';
      activeSocket.send(encodeExecdPtyStdinFrame(chunk));
      if (/[\r\n]/.test(chunk)) {
        pendingCommandRefresh = true;
        scheduleWorkspaceRefresh();
      }
    };

    const scheduleReconnect = (message: string, delayMs: number) => {
      if (isDestroyed) {
        return;
      }
      if (reconnectCount >= MAX_RECONNECT_ATTEMPTS) {
        term.write(`\r\n\x1b[1;31m${message} Reconnect stopped.\x1b[0m\r\n`);
        return;
      }
      reconnectCount += 1;
      term.write(
        `\r\n\x1b[1;33m${message} Reconnecting in ${Math.round(delayMs / 1000)}s...\x1b[0m\r\n`
      );
      reconnectTimer = setTimeout(() => {
        void connect();
      }, delayMs);
    };

    const connect = async () => {
      if (isDestroyed) {
        return;
      }
      const generation = ++connectGeneration;
      clearConnectionState();

      try {
        fitAddon.fit();
      } catch {}

      let ticketInfo: Awaited<ReturnType<typeof getSandboxTerminalTicket>>;
      try {
        ticketInfo = await getSandboxTerminalTicket({
          ...sandboxTarget,
          chatId,
          outLinkAuthData,
          cols: term.cols > 0 ? term.cols : undefined,
          rows: term.rows > 0 ? term.rows : undefined
        });
      } catch (err) {
        if (isDestroyed || generation !== connectGeneration) {
          return;
        }
        const errorMessage = err instanceof Error ? err.message : String(err);
        scheduleReconnect(`Error: Ticket request failed: ${errorMessage}.`, 5_000);
        return;
      }

      if (isDestroyed || generation !== connectGeneration) {
        return;
      }

      if (
        ticketInfo.reused === false ||
        (connectedPtySessionId !== '' && connectedPtySessionId !== ticketInfo.ptySessionId)
      ) {
        lastOffset = 0;
      }
      connectedPtySessionId = ticketInfo.ptySessionId;

      const wsUrl = new URL(ticketInfo.url, window.location.origin);
      wsUrl.searchParams.set('ticket', ticketInfo.ticket);
      if (lastOffset > 0) {
        wsUrl.searchParams.set('since', String(lastOffset));
      }

      let shellExited = false;
      const ws = new WebSocket(wsUrl.toString());
      ws.binaryType = 'arraybuffer';
      activeSocket = ws;

      ws.onopen = () => {
        if (isDestroyed || generation !== connectGeneration) {
          ws.close();
          return;
        }
        if (lastOffset === 0) {
          term.write('\r\n\x1b[1;36mSystem: Connected to Sandbox Terminal Session\x1b[0m\r\n\r\n');
        }
        try {
          fitAddon.fit();
          sendResize(term.cols, term.rows);
        } catch {}

        stableConnectionTimer = setTimeout(() => {
          if (!isDestroyed && generation === connectGeneration && activeSocket === ws) {
            reconnectCount = 0;
          }
        }, STABLE_CONNECTION_MS);

        heartbeatTimer = setInterval(() => {
          if (!isDestroyed && activeSocket === ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, HEARTBEAT_PING_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        if (isDestroyed || generation !== connectGeneration) {
          return;
        }

        if (event.data instanceof ArrayBuffer) {
          const decoded = decodeExecdPtyBinaryFrameWithOffset(
            new Uint8Array(event.data),
            lastOffset
          );
          if (decoded && decoded.bytes.byteLength > 0) {
            reconnectCount = 0;
            lastOffset = decoded.nextOffset;
            term.write(decoded.bytes);
            if (pendingCommandRefresh) {
              scheduleWorkspaceRefresh();
            }
          }
          return;
        }

        if (typeof event.data === 'string') {
          try {
            const frame = JSON.parse(event.data) as {
              type?: string;
              offset?: number;
              exit_code?: number | null;
              error?: string;
            };
            if (frame.type === 'offset' && typeof frame.offset === 'number' && frame.offset >= 0) {
              lastOffset = frame.offset;
            } else if (frame.type === 'exit') {
              shellExited = true;
              lastOffset = 0;
              dispatchSandboxWorkspaceRefresh();
              term.write(
                `\r\n\x1b[1;33mTerminal: Shell exited (code: ${frame.exit_code ?? 'unknown'}).\x1b[0m\r\n`
              );
              clearConnectionState();
            } else if (frame.type === 'error') {
              const errMsg = frame.error?.trim() || 'Terminal error';
              term.write(`\r\n\x1b[1;31mTerminal Error: ${errMsg}\x1b[0m\r\n`);
            }
          } catch {}
        }
      };

      ws.onerror = () => {
        // 连接异常将紧随触发 onclose，由 onclose 统一调度重连。
      };

      ws.onclose = () => {
        if (isDestroyed || generation !== connectGeneration) {
          return;
        }
        clearConnectionState();
        if (!shellExited) {
          scheduleReconnect('Terminal: Connection closed.', 3_000);
        }
      };
    };

    void connect();

    const onDataDisposable = term.onData((data) => {
      if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
        return;
      }
      inputBuffer += data;
      if (!flushInputTimer) {
        flushInputTimer = setTimeout(flushStdin, 16);
      }
    });

    const onResizeDisposable = term.onResize(({ cols, rows }) => {
      sendResize(cols, rows);
    });

    const resizeObserver = new ResizeObserver(() => {
      if (isDestroyed) {
        return;
      }
      try {
        fitAddon.fit();
      } catch {}
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      isDestroyed = true;
      connectGeneration += 1;
      clearConnectionState();
      onDataDisposable.dispose();
      onResizeDisposable.dispose();
      resizeObserver.disconnect();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (refreshWorkspaceTimer) {
        clearTimeout(refreshWorkspaceTimer);
      }
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sandboxTarget,
    sandboxTargetId,
    chatId,
    canWrite,
    outLinkAuthData?.shareId,
    outLinkAuthData?.outLinkUid
  ]);

  return {
    containerRef
  };
};
