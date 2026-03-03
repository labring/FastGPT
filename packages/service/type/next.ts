import type { NextApiRequest, NextApiResponse } from 'next';

export type ApiRequestProps<Body = any, Query = any> = Omit<NextApiRequest, 'query' | 'body'> & {
  query: Query;
  body: Body;
};

export type { NextApiResponse as ApiResponseType } from 'next';
