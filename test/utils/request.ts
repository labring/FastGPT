import type { NextApiHandler } from '@fastgpt/next/type';
import type { MockReqType } from '../mocks/request';
import { vi } from 'vitest';
import { Writable } from 'node:stream';

/** 调用 API handler，并提供非流式路由所需的响应方法，收集 write/json 返回的数据。 */
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
    // 非流式调用只需提供生命周期回调的注册/清理接口。
    once: vi.fn().mockReturnThis(),
    off: vi.fn().mockReturnThis(),
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

/** 用真实 Writable 收集下载响应，保留二进制字节与流事件。 */
export async function StreamCall<B = any, Q = any, R = any>(
  handler: NextApiHandler<R>,
  props?: MockReqType<B, Q>
) {
  const { body = {}, query = {}, ...rest } = props || {};
  const chunks: Buffer[] = [];
  const headers: Record<string, string> = {};
  const res = Object.assign(
    new Writable({
      write(chunk: Buffer, _encoding, done) {
        chunks.push(chunk);
        done();
      }
    }),
    {
      statusCode: 200,
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
      status(code: number) {
        res.statusCode = code;
        return res;
      },
      json(value: unknown) {
        res.end(JSON.stringify(value));
        return res;
      }
    }
  );
  const response = (await handler(
    {
      body: JSON.parse(JSON.stringify(body)),
      query: JSON.parse(JSON.stringify(query)),
      ...(rest as any)
    },
    res as never
  )) as { code?: number; data?: R; error?: unknown } | undefined;

  return {
    code: response?.code ?? res.statusCode,
    data: response?.data,
    error: response?.error,
    buffer: Buffer.concat(chunks),
    headers
  };
}
