import type { NextApiHandler } from '@fastgpt/service/common/middle/entry';
import type { MockReqType } from '../mocks/request';
import { vi } from 'vitest';

export async function Call<B = any, Q = any, R = any>(
  handler: NextApiHandler<R>,
  props?: MockReqType<B, Q>
): Promise<{
  code: number;
  data: R;
  error?: any;
  raw?: any;
}> {
  const { body = {}, query = {}, ...rest } = props || {};
  let raw: string | any = '';

  return new Promise((resolve) => {
    let endResolve: (() => void) | null = null;
    const endPromise = new Promise<void>((res) => {
      endResolve = res;
    });

    const res: any = {
      setHeader: vi.fn(),
      write: vi.fn((data: any) => {
        if (typeof data === 'string') {
          raw += data;
        } else {
          raw = data;
        }
        return true;
      }),
      end: vi.fn(() => {
        // 流式响应结束
        if (endResolve) {
          endResolve();
        }
      }),
      on: vi.fn((event: string, callback: Function) => {
        if (event === 'drain') {
          // 模拟 drain 事件
        }
      }),
      status: vi.fn()
    };
    // 启动 handler（立即返回,开始流式处理)
    const handlerPromise = handler(
      {
        body: JSON.parse(JSON.stringify(body)),
        query: JSON.parse(JSON.stringify(query)),
        ...(rest as any)
      },
      res
    );

    // 等待流式响应结束
    Promise.all([handlerPromise, endPromise])
      .then(([response]: [any, void]) => {
        // Handler 和流都完成了
        if (response && typeof response === 'object' && 'code' in response) {
          // JSON 响应
          resolve({
            ...response,
            raw
          });
        } else {
          // 流式响应
          setImmediate(() => {
            resolve({
              code: 200,
              data: null as R,
              error: undefined,
              raw
            });
          });
        }
      })
      .catch((error: any) => {
        resolve({
          code: 500,
          error,
          data: null as R,
          raw
        });
      });
  });
}
