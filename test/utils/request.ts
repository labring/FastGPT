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
    end: vi.fn()
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
