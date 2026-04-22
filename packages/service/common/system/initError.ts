import { inspect } from 'node:util';

type ErrTextGetter = (error: any, def?: string) => string;

type SerializedInitializationError = {
  message: string;
  name?: string;
  code?: string;
  stage?: string;
  step?: string;
  stack?: string;
  cause?: SerializedInitializationError;
  details: string;
};

type InitializationLogger = {
  error: (message: string, payload?: Record<string, unknown>) => void;
  info?: (message: string, payload?: Record<string, unknown>) => void;
};

const getObjectMessage = (error: Record<string, any>, fallback: string) => {
  const message =
    (typeof error.message === 'string' && error.message) ||
    (typeof error.msg === 'string' && error.msg) ||
    (typeof error.error === 'string' && error.error) ||
    (typeof error.code === 'string' && error.code);

  return message || fallback;
};

export const serializeInitializationError = (
  error: unknown,
  depth = 0
): SerializedInitializationError => {
  const fallback = 'Unknown initialization error';

  if (depth > 5) {
    return {
      message: 'Max initialization error depth reached',
      details: 'Max initialization error depth reached'
    };
  }

  if (error instanceof Error) {
    const err = error as Error & {
      code?: string;
      stage?: string;
      step?: string;
      cause?: unknown;
    };

    return {
      message: err.message || fallback,
      name: err.name,
      code: err.code,
      stage: err.stage,
      step: err.step,
      stack: err.stack,
      cause: err.cause ? serializeInitializationError(err.cause, depth + 1) : undefined,
      details: inspect(error, { depth: 6, breakLength: 120 })
    };
  }

  if (typeof error === 'string') {
    return {
      message: error || fallback,
      details: error || fallback
    };
  }

  if (error && typeof error === 'object') {
    const err = error as Record<string, any>;

    return {
      message: getObjectMessage(err, fallback),
      code: typeof err.code === 'string' ? err.code : undefined,
      stage: typeof err.stage === 'string' ? err.stage : undefined,
      step: typeof err.step === 'string' ? err.step : undefined,
      cause: err.cause ? serializeInitializationError(err.cause, depth + 1) : undefined,
      details: inspect(error, { depth: 6, breakLength: 120 })
    };
  }

  return {
    message: fallback,
    details: String(error)
  };
};

export const createInitializationError = (
  error: unknown,
  {
    stage,
    step,
    getErrText
  }: {
    stage?: string;
    step?: string;
    getErrText?: ErrTextGetter;
  } = {}
) => {
  const fallback = 'Unknown initialization error';
  const errorText =
    getErrText?.(error, fallback) || serializeInitializationError(error).message || fallback;
  const labels = [stage, step].filter(Boolean).join(' / ');
  const wrappedError = new Error(labels ? `[${labels}]: ${errorText}` : errorText, {
    cause: error
  });

  wrappedError.name = 'SystemInitializationError';

  return Object.assign(wrappedError, {
    stage,
    step
  });
};

export const runInitializationStep = async <T>({
  step,
  action,
  stage,
  logger,
  getErrText,
  meta
}: {
  step: string;
  action: () => Promise<T> | T;
  stage?: string;
  logger?: InitializationLogger;
  getErrText?: ErrTextGetter;
  meta?: Record<string, unknown>;
}) => {
  try {
    return await action();
  } catch (error) {
    const logPayload = {
      step,
      stage,
      ...meta,
      ...getInitializationErrorLog(error)
    };

    console.error('System initialization step failed', logPayload);
    logger?.error(`System initialization step failed: ${step}`, logPayload);

    throw createInitializationError(error, {
      stage,
      step,
      getErrText
    });
  }
};

export const runBackgroundInitializationStep = ({
  step,
  action,
  stage,
  logger,
  getErrText,
  meta
}: {
  step: string;
  action: () => Promise<unknown> | unknown;
  stage?: string;
  logger?: InitializationLogger;
  getErrText?: ErrTextGetter;
  meta?: Record<string, unknown>;
}) => {
  try {
    const task = action();

    logger?.info?.('System background initialization step started', {
      step,
      stage,
      ...meta
    });

    void Promise.resolve(task).catch((error) => {
      const logPayload = {
        step,
        stage,
        ...meta,
        ...getInitializationErrorLog(error)
      };

      console.error('System background initialization step failed', logPayload);
      logger?.error(`System background initialization step failed: ${step}`, logPayload);
    });
  } catch (error) {
    const logPayload = {
      step,
      stage,
      ...meta,
      ...getInitializationErrorLog(error)
    };

    console.error('System background initialization step failed', logPayload);
    logger?.error(`System background initialization step failed: ${step}`, logPayload);

    throw createInitializationError(error, {
      stage,
      step,
      getErrText
    });
  }
};

export const getInitializationErrorLog = (error: unknown) => {
  const serialized = serializeInitializationError(error);

  return {
    errorMessage: serialized.message,
    errorName: serialized.name,
    errorCode: serialized.code,
    errorStage: serialized.stage,
    errorStep: serialized.step,
    errorStack: serialized.stack,
    errorCause: serialized.cause,
    errorDetails: serialized.details
  };
};
