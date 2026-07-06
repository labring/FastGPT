import { ZodError, type z } from 'zod';

export type ZodRequestInputSource = 'body' | 'query' | 'params';

export type ZodRequestParseErrorContext = {
  inputSource: ZodRequestInputSource;
};

export class ApiRequestInputParseError extends Error {
  context: ZodRequestParseErrorContext;
  cause: ZodError;

  /**
   * 表示 API 请求入参校验失败。只由 `parseApiInput` 创建，用于和内部 `ZodError` 明确区分。
   */
  constructor(error: ZodError, context: ZodRequestParseErrorContext) {
    super(error.message);
    this.name = 'ApiRequestInputParseError';
    this.context = context;
    this.cause = error;
  }
}

function parseRequestInput<T extends z.ZodTypeAny>(
  schema: T,
  req: Partial<Record<ZodRequestInputSource, unknown>>,
  inputSource: ZodRequestInputSource
): z.output<T> {
  try {
    return schema.parse(req[inputSource]);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ApiRequestInputParseError(error, { inputSource });
    }

    throw error;
  }
}

type ParseApiInputProps<
  B extends z.ZodTypeAny | undefined,
  Q extends z.ZodTypeAny | undefined,
  P extends z.ZodTypeAny | undefined
> = {
  req: Partial<Record<ZodRequestInputSource, unknown>>;
  bodySchema?: B;
  querySchema?: Q;
  paramsSchema?: P;
};

type ParseApiInputResult<
  B extends z.ZodTypeAny | undefined,
  Q extends z.ZodTypeAny | undefined,
  P extends z.ZodTypeAny | undefined
> = (B extends z.ZodTypeAny ? { body: z.output<B> } : object) &
  (Q extends z.ZodTypeAny ? { query: z.output<Q> } : object) &
  (P extends z.ZodTypeAny ? { params: z.output<P> } : object);

/**
 * 在 API 边界解析请求入参，并把失败的 `ZodError` 包装成明确的 API 入参错误。
 * 只有该错误会被入口层视为可降级的外部调用参数错误，普通 `ZodError` 仍按内部 bug 处理。
 */
export function parseApiInput<
  B extends z.ZodTypeAny | undefined = undefined,
  Q extends z.ZodTypeAny | undefined = undefined,
  P extends z.ZodTypeAny | undefined = undefined
>({
  req,
  bodySchema,
  querySchema,
  paramsSchema
}: ParseApiInputProps<B, Q, P>): ParseApiInputResult<B, Q, P> {
  return {
    ...(bodySchema ? { body: parseRequestInput(bodySchema, req, 'body') } : {}),
    ...(querySchema ? { query: parseRequestInput(querySchema, req, 'query') } : {}),
    ...(paramsSchema ? { params: parseRequestInput(paramsSchema, req, 'params') } : {})
  } as ParseApiInputResult<B, Q, P>;
}

export function getZodParseErrorInputSource(error: unknown) {
  return error instanceof ApiRequestInputParseError ? error.context : undefined;
}

export function getZodError(error: unknown) {
  if (error instanceof ApiRequestInputParseError) return error.cause;
  if (error instanceof ZodError) return error;
}
