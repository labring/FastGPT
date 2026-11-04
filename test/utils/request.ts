import { EventEmitter } from 'node:events';
import type { NextApiHandler } from '@fastgpt/next/type';
import type { MockReqType } from '../mocks/request';
import { vi } from 'vitest';

/** 调用 API handler，并提供非流式路由所需的响应方法，收集 write/json 返回的数据。 */
export async function Call<B = any, Q = any, R = any>(
  handler: NextApiHandler<R>,
  props?: MockReqType<B, Q>
) {
  const { body = {}, query = {}, ...rest } = props || {};
  let raw;
  const events = new EventEmitter();
  const res: any = {
    setHeader: vi.fn(),
    write: vi.fn((data: any) => {
      raw = data;
      return true;
    }),
    json: vi.fn((data: any) => {
      raw = data;
      return data;
    }),
    end: vi.fn(),
    on: vi.fn((event: string) => {
      if (event === 'drain') {
        // 模拟 drain 事件
      }
    }),
    // 聊天生命周期使用 once/off 注册和清理回调，保持与 Node HTTP 响应相同的接口。
    once: vi.fn((event: string, callback: (...args: any[]) => void) => {
      events.once(event, callback);
      return res;
    }),
    off: vi.fn((event: string, callback: (...args: any[]) => void) => {
      events.off(event, callback);
      return res;
    }),
    status: vi.fn(() => res)
  };
  const response = (await handler(
    {
      body: JSON.parse(JSON.stringify(body)),
      query: JSON.parse(JSON.stringify(query)),
      ...(rest as any)
    },
    res
  )) as any;
  return {
    ...response,
    raw
  } as {
    code: number;
    data: R;
    error?: any;
    raw?: any;
  };
}

// Stream call for handling streaming responses like CSV downloads
export async function StreamCall<B = any, Q = any, R = any>(
  handler: NextApiHandler<R>,
  props?: MockReqType<B, Q>
) {
  const { body = {}, query = {}, ...rest } = props || {};
  const chunks: any[] = [];
  const headers: Record<string, string> = {};

  // Create a promise that resolves when stream ends
  let resolveStream: () => void;
  const streamEndPromise = new Promise<void>((resolve) => {
    resolveStream = resolve;
  });

  let statusCode = 200;
  const eventListeners: Record<string, Array<(...args: unknown[]) => unknown>> = {};

  const res: any = {
    setHeader: vi.fn((key: string, value: string) => {
      headers[key] = value;
    }),
    write: vi.fn((data: any) => {
      chunks.push(data);
      return true; // Indicate write was successful (no backpressure)
    }),
    end: vi.fn((data?: any) => {
      if (data) {
        chunks.push(data);
      }
      // Resolve the promise when stream ends
      resolveStream();
    }),
    on: vi.fn((event: string, callback: (...args: unknown[]) => unknown) => {
      // Store event listeners for potential triggering
      if (!eventListeners[event]) {
        eventListeners[event] = [];
      }
      eventListeners[event].push(callback);
      return res; // Support chaining
    }),
    status: vi.fn((code: number) => {
      statusCode = code;
      return res;
    }),
    // Add closed property to check if response is closed
    closed: false
  };

  // Call handler (may return immediately while stream continues)
  const response = (await handler(
    {
      body: JSON.parse(JSON.stringify(body)),
      query: JSON.parse(JSON.stringify(query)),
      ...(rest as any)
    },
    res
  )) as any;

  // Wait for stream to finish writing all data (res.end() to be called)
  await streamEndPromise;

  // Mark response as closed
  res.closed = true;

  // Combine all chunks into a single string or buffer
  const raw = chunks.join('');

  return {
    code: statusCode,
    data: response?.data,
    error: response?.error,
    raw,
    chunks,
    headers
  } as {
    code: number;
    data: R;
    error?: any;
    raw?: any;
    chunks?: any[];
    headers?: Record<string, string>;
  };
}
