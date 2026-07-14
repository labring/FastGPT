import type { StreamResponseContract } from '../../type/contract';
import { responseWrite } from './index';

export type SseStreamWriter = (params: { event?: string; data: string }) => void;

export type SseStreamResumeMirror = {
  enqueueRaw?: (chunk: string) => Promise<void> | void;
  flush?: () => Promise<void>;
  shrinkTTLAfterComplete?: () => Promise<void>;
};

type CreateSseStreamContextParams = {
  res?: StreamResponseContract;
  stream?: boolean;
  streamResumeMirror?: SseStreamResumeMirror;
  heartbeat?: {
    intervalMs?: number;
    write: (writer: SseStreamWriter) => void;
  };
  onCleanup?: () => void;
  onError?: () => void;
};

const isResponseClosed = (res: StreamResponseContract) =>
  !!(res.closed || res.writableEnded || res.destroyed);

/**
 * 创建通用 SSE 协议上下文。
 *
 * 该 helper 只处理 header、原始 chunk 写入、resume mirror、心跳和连接清理；
 * 不理解 workflow、chat 或 auxiliary generation 的事件语义。
 */
export const createSseStreamContext = ({
  res,
  stream = true,
  streamResumeMirror,
  heartbeat,
  onCleanup,
  onError
}: CreateSseStreamContextParams) => {
  const write: SseStreamWriter = ({ event, data }) => {
    if (!stream) return;

    const raw = `${event ? `event: ${event}\n` : ''}data: ${data}\n\n`;
    void streamResumeMirror?.enqueueRaw?.(raw);

    if (!res || isResponseClosed(res)) return;
    responseWrite({ res, event, data });
  };

  if (!stream || !res) {
    return {
      write,
      cleanup: () => undefined,
      async flushResume() {
        await streamResumeMirror?.flush?.();
        await streamResumeMirror?.shrinkTTLAfterComplete?.();
      }
    };
  }

  if (!res.headersSent) {
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Content-Type', 'text/event-stream;charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
  }

  let cleaned = false;
  const streamCheckTimer = heartbeat
    ? setInterval(() => {
        heartbeat.write(write);
      }, heartbeat.intervalMs ?? 10000)
    : undefined;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (streamCheckTimer) {
      clearInterval(streamCheckTimer);
    }
    onCleanup?.();
  };

  res.once('finish', cleanup);
  res.once('close', cleanup);
  res.on('error', () => {
    cleanup();
    onError?.();
    res.end();
  });

  return {
    write,
    cleanup,
    async flushResume() {
      await streamResumeMirror?.flush?.();
      await streamResumeMirror?.shrinkTTLAfterComplete?.();
    }
  };
};
