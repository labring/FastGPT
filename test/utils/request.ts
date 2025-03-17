import { NextApiHandler } from '@fastgpt/service/common/middle/entry';
import { MockReqType } from '../mocks/request';

export async function Call<B = any, Q = any, R = any>(
  handler: NextApiHandler<R>,
  props?: MockReqType<B, Q>
) {
  const { body = {}, query = {}, ...rest } = props || {};
  return (await handler(
    {
      body: body,
      query: query,
      ...(rest as any)
    },
    {} as any
  )) as Promise<{
    code: number;
    data: R;
    error?: any;
  }>;
}
