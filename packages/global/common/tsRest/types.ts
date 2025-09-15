import type { AppRoute } from '@ts-rest/core';
import type { createSingleRouteHandler } from '@ts-rest/next';
import type { contract } from 'common/tsRest/contract';
export type { AppRoute } from '@ts-rest/core';

export type Endpoint<T extends AppRoute> = Parameters<typeof createSingleRouteHandler<T>>[1];
export type Args<T extends AppRoute> = Parameters<Endpoint<T>>[0];
export type Result<T extends AppRoute> = Awaited<ReturnType<Endpoint<T>>>;

export type Ok<T extends AppRoute> = Extract<Result<T>, { status: 200 }>;
export type Response<T extends AppRoute> = Ok<T> extends { body: infer B } ? B : never;

export type Handler<T extends AppRoute> = (args: Args<T>) => Promise<Response<T>>;

export type Router<R> = {
  [K in keyof R]: R[K] extends AppRoute ? Endpoint<R[K]> : Router<R[K]>;
};

export type RouterOfIndexContract = Router<typeof contract>;
