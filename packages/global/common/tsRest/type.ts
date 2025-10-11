import type { AppRoute } from '@ts-rest/core';
import type { createSingleRouteHandler } from '@ts-rest/next';

export type { AppRoute } from '@ts-rest/core';

export type Endpoint<T extends AppRoute> = Parameters<typeof createSingleRouteHandler<T>>[1];
export type Args<T extends AppRoute> = Parameters<Endpoint<T>>[0];
type Result<T extends AppRoute> = Awaited<ReturnType<Endpoint<T>>>;

type Ok<T extends AppRoute> = Extract<Result<T>, { status: 200 }>;
type Response<T extends AppRoute> =
  Ok<T> extends { body: infer B } ? (B extends { data: infer D } ? D : B) : never;

export type Handler<T extends AppRoute> = (args: Args<T>) => Promise<Response<T>>;
