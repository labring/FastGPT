import { createMiddleware } from 'hono/factory';
import { getLogger, LogCategories } from '../utils';

const logger = getLogger(LogCategories.HTTP);

const requestStore = new WeakMap<Request, { startTime: number; errorMessage?: string }>();

export const loggerMiddleware = createMiddleware(async (c, next) => {
  const startTime = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  requestStore.set(c.req.raw, { startTime });

  logger.info`--> ${method} ${path}`;

  await next();

  const duration = Date.now() - startTime;
  const status = c.res.status;
  const stored = requestStore.get(c.req.raw);
  const errorMessage = status >= 400 ? stored?.errorMessage : undefined;

  if (status >= 400) {
    logger.error(`<-- ${method} ${path} ${status} ${duration}ms`, {
      method,
      path,
      status,
      duration,
      ...(errorMessage ? { error: errorMessage } : {})
    });
  } else {
    logger.info(`<-- ${method} ${path} ${status} ${duration}ms`, {
      method,
      path,
      status,
      duration
    });
  }

  requestStore.delete(c.req.raw);
});

export function setLoggerError(req: Request, message: string): void {
  const stored = requestStore.get(req);
  if (stored) {
    stored.errorMessage = message;
  }
}
