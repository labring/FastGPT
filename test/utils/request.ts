import type { NextApiHandler } from '@fastgpt/service/common/middle/entry';
import type { MockReqType } from '../mocks/request';
import { vi } from 'vitest';

export async function Call<B = any, Q = any, R = any>(
  handler: NextApiHandler<R>,
  props?: MockReqType<B, Q>
) {
  const { body = {}, query = {}, ...rest } = props || {};
  let raw;
  const res: any = {
    setHeader: vi.fn(),
    write: vi.fn((data: any) => {
      raw = data;
    }),
    end: vi.fn(),
    on: vi.fn((event: string, callback: Function) => {
      if (event === 'drain') {
        // 模拟 drain 事件
      }
    }),
    status: vi.fn()
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
  let rejectStream: (err: any) => void;
  const streamEndPromise = new Promise<void>((resolve, reject) => {
    resolveStream = resolve;
    rejectStream = reject;
  });

  let statusCode = 200;
  const eventListeners: Record<string, Function[]> = {};

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
    on: vi.fn((event: string, callback: Function) => {
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
