import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { env } from '../env';

/**
 * Bearer token authentication middleware
 * Validates Authorization header: Bearer <token>
 */
export const authMiddleware = createMiddleware(async (c, next) => {
  const authorization = c.req.header('Authorization');

  if (!authorization) {
    throw new HTTPException(401, { message: 'Authorization header is required' });
  }

  if (!authorization.startsWith('Bearer ')) {
    throw new HTTPException(401, {
      message: 'Invalid authorization format. Expected: Bearer <token>'
    });
  }

  const token = authorization.slice(7);

  if (token !== env.TOKEN) {
    throw new HTTPException(401, { message: 'Invalid token' });
  }

  await next();
});
