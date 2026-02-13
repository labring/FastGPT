import { createMiddleware } from 'hono/factory';
import { logger } from '../utils';

// Store for request timing and error info
const requestStore = new WeakMap<Request, { startTime: number; errorMessage?: string }>();

/**
 * HTTP Logger middleware
 * Logs request start and completion with timing information
 */
export const loggerMiddleware = createMiddleware(async (c, next) => {
  const startTime = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  // Store timing info
  requestStore.set(c.req.raw, { startTime });

  // Log request start
  logger.httpRequest(method, path);

  await next();

  // Log response
  const duration = Date.now() - startTime;
  const status = c.res.status;
  const stored = requestStore.get(c.req.raw);
  const errorMessage = status >= 400 ? stored?.errorMessage : undefined;

  logger.httpResponse(method, path, status, duration, errorMessage);

  // Cleanup
  requestStore.delete(c.req.raw);
});

/**
 * Set error message for logging (called from errorHandler)
 */
export function setLoggerError(req: Request, message: string): void {
  const stored = requestStore.get(req);
  if (stored) {
    stored.errorMessage = message;
  }
}
