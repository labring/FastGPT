import { ZodError, type z } from 'zod';

/** 请求入参来源；除 parseApiInput 处理的 body/query/params 外，显式校验请求头时也允许标记为 header */
export type ZodRequestInputSource = 'body' | 'query' | 'params' | 'header';

type ParseApiInputSource = 'body' | 'query' | 'params';

export type ZodRequestParseErrorContext = {
  inputSource: ZodRequestInputSource;
};

// Next.js 按需编译或热更新会重复加载模块，使用同进程稳定标识保留显式 API 入参错误的身份。
const apiRequestInputParseErrorBrand = Symbol.for('fastgpt.ApiRequestInputParseError');

export class ApiRequestInputParseError extends Error {
  readonly [apiRequestInputParseErrorBrand] = true;
  context: ZodRequestParseErrorContext;
  cause: ZodError;

  /**
   * 由 API 入参校验边界显式创建，用于和内部 `ZodError` 明确区分。
   */
  constructor(error: ZodError, context: ZodRequestParseErrorContext) {
    super(error.message);
    this.name = 'ApiRequestInputParseError';
    this.context = context;
    this.cause = error;
  }
}

/** 只识别显式创建的请求错误；不凭 name/context 将普通内部错误降级为 400。 */
const isApiRequestInputParseError = (error: unknown): error is ApiRequestInputParseError =>
  error instanceof ApiRequestInputParseError ||
  (typeof error === 'object' &&
    error !== null &&
    apiRequestInputParseErrorBrand in error &&
    error[apiRequestInputParseErrorBrand] === true);

function parseRequestInput<T extends z.ZodTypeAny>(
  schema: T,
  req: Partial<Record<ParseApiInputSource, unknown>>,
  inputSource: ParseApiInputSource
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
  req: Partial<Record<ParseApiInputSource, unknown>>;
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
  return isApiRequestInputParseError(error) ? error.context : undefined;
}

export function getZodError(error: unknown) {
  if (isApiRequestInputParseError(error)) return error.cause;
  if (error instanceof ZodError) return error;
}
