import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { setLoggerError } from './logger';

/**
 * Global error handler
 * Catches all errors and returns consistent JSON response
 */
export const errorHandler: ErrorHandler = (err, c) => {
  // Handle HTTP exceptions
  if (err instanceof HTTPException) {
    setLoggerError(c.req.raw, err.message);
    return c.json(
      {
        success: false,
        message: err.message
      },
      err.status
    );
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const message = 'Validation error';
    setLoggerError(c.req.raw, message);
    return c.json(
      {
        success: false,
        message,
        errors: err.issues
      },
      400
    );
  }

  // Handle generic errors
  const message = err instanceof Error ? err.message : 'Internal Server Error';
  setLoggerError(c.req.raw, message);
  return c.json(
    {
      success: false,
      message
    },
    500
  );
};
