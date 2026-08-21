import type { NextApiRequest, NextApiResponse } from 'next';

export type ApiRequestProps<Body = any, Query = any> = Omit<NextApiRequest, 'body' | 'query'> & {
  body: Body;
  query: Query;
};

export type NextApiHandler<Data = any> = (
  req: ApiRequestProps,
  res: NextApiResponse<Data>
) => unknown | Promise<unknown>;

export type ApiResponseType<Data = any> = NextApiResponse<Data>;
export type NextApiRequestProps<Body = any, Query = any> = ApiRequestProps<Body, Query>;
export type { NextApiRequest, NextApiResponse } from 'next';
