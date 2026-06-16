import { useCallback, useEffect, useRef } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { getSandboxProxyWsUrl, getSandboxTicket } from '../api';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

type UseTerminalProps = {
  appId: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
  canWrite?: boolean;
};

const MAX_RECONNECT_ATTEMPTS = 3;
const STABLE_CONNECTION_MS = 2000;

export const useInteractiveTerminal = ({
  appId,
  chatId,
  outLinkAuthData,
  canWrite = true
}: UseTerminalProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // 1. 初始化 Terminal 终端与 WebSocket 数据通信流
  useEffect(() => {
    if (!containerRef.current || !appId || !chatId) return;

    let isDestroyed = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stableConnectionTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectCount = 0;

    // 实例化 Xterm 终端
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
    termRef.current = term;

    if (!canWrite) {
      term.write('\r\n\x1b[1;31mTerminal requires write permission.\x1b[0m\r\n');
      return () => {
        term.dispose();
      };
    }

    // 自适应尺寸变化信号器 (发送符合 Rust Agent 契约的 13 字节大端协议数据)
    const sendResize = (cols: number, rows: number) => {
      if (cols <= 0 || rows <= 0 || !cols || !rows || isNaN(cols) || isNaN(rows)) {
        console.warn('[SandboxTerminal] Ignored invalid resize dimensions:', cols, rows);
        return;
      }
      if (ws && ws.readyState === WebSocket.OPEN) {
        const buf = new ArrayBuffer(13);
        const view = new DataView(buf);
        view.setUint8(0, 0xfe); // 0xFE 引导头
        view.setUint32(1, cols, false); // cols (4字节 Big-Endian)
        view.setUint32(5, rows, false); // rows (4字节 Big-Endian)
        view.setUint32(9, 0, false); // padding
        ws.send(buf);
      }
    };

    const connect = async () => {
      try {
        const res = await getSandboxTicket({
          appId,
          chatId,
          outLinkAuthData,
          channel: 'terminal',
          permission: 'write'
        });
        const ticket = res.ticket;

        if (!ticket) {
          throw new Error('Ticket not found in response');
        }
        if (isDestroyed) return;

        const wsUrl = getSandboxProxyWsUrl({ channel: 'terminal', ticket });

        ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = () => {
          if (isDestroyed) {
            ws?.close();
            return;
          }
          stableConnectionTimer = setTimeout(() => {
            if (!isDestroyed && wsRef.current === ws && ws?.readyState === WebSocket.OPEN) {
              reconnectCount = 0;
            }
          }, STABLE_CONNECTION_MS);
          term.write('\r\n\x1b[1;36mSystem: Connected to Sandbox Terminal Session\x1b[0m\r\n\r\n');
          try {
            fitAddon.fit();
            sendResize(term.cols, term.rows);
          } catch (e) {
            console.warn('Initial terminal fit failed', e);
          }
        };

        ws.onmessage = (event) => {
          if (isDestroyed) return;
          reconnectCount = 0;
          if (event.data instanceof ArrayBuffer) {
            term.write(new Uint8Array(event.data));
          } else if (typeof event.data === 'string') {
            term.write(event.data);
          }
        };

        ws.onclose = (event) => {
          if (wsRef.current !== ws) return;

          wsRef.current = null;
          if (stableConnectionTimer) {
            clearTimeout(stableConnectionTimer);
            stableConnectionTimer = null;
          }
          if (!isDestroyed) {
            if (reconnectCount >= MAX_RECONNECT_ATTEMPTS) {
              term.write(
                `\r\n\x1b[1;31mTerminal: Connection lost (code: ${event.code}, reason: ${event.reason || 'none'}). Reconnect stopped.\x1b[0m\r\n`
              );
              return;
            }
            reconnectCount++;
            term.write(
              `\r\n\x1b[1;33mTerminal: Connection lost (code: ${event.code}, reason: ${event.reason || 'none'}). Reconnecting in 3s...\x1b[0m\r\n`
            );
            reconnectTimer = setTimeout(connect, 3000);
          }
        };

        ws.onerror = (err) => {
          console.error('[SandboxTerminal] WS error:', err);
          ws?.close();
        };
      } catch (err) {
        console.error('[SandboxTerminal] Connection error:', err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (!isDestroyed) {
          if (reconnectCount >= MAX_RECONNECT_ATTEMPTS) {
            term.write(
              `\r\n\x1b[1;31mError: Connection failed: ${errorMessage}. Reconnect stopped.\x1b[0m\r\n`
            );
            return;
          }
          reconnectCount++;
          term.write(
            `\r\n\x1b[1;31mError: Connection failed: ${errorMessage}. Retrying in 5s...\x1b[0m\r\n`
          );
          reconnectTimer = setTimeout(connect, 5000);
        }
      }
    };

    connect();

    // 绑定 xterm 键盘输入与 resize 响应
    const onDataDisposable = term.onData((data) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    const onResizeDisposable = term.onResize(({ cols, rows }) => {
      sendResize(cols, rows);
    });

    // 基于 ResizeObserver 的窗口容器自适应
    const resizeObserver = new ResizeObserver(() => {
      if (isDestroyed) return;
      try {
        fitAddon.fit();
      } catch {}
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      isDestroyed = true;
      onDataDisposable.dispose();
      onResizeDisposable.dispose();
      resizeObserver.disconnect();
      if (ws) {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        ws.close();
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (stableConnectionTimer) {
        clearTimeout(stableConnectionTimer);
      }
      term.dispose();
    };
  }, [
    appId,
    chatId,
    canWrite,
    outLinkAuthData?.shareId,
    outLinkAuthData?.outLinkUid,
    outLinkAuthData?.teamId,
    outLinkAuthData?.teamToken
  ]);

  return {
    containerRef
  };
};
