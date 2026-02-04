import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { errorHandler } from '../../src/middleware/error';

describe('Error Handler', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  const createTestApp = (errorToThrow: () => Error) => {
    const app = new Hono();
    app.onError(errorHandler);
    app.get('/error', () => {
      throw errorToThrow();
    });
    return app;
  };

  describe('HTTPException handling', () => {
    it('should handle HTTPException with 401 status', async () => {
      const app = createTestApp(() => new HTTPException(401, { message: 'Unauthorized' }));
      const res = await app.request('/error');

      expect(res.status).toBe(401);
      const data = (await res.json()) as { success: boolean; message: string };
      expect(data.success).toBe(false);
      expect(data.message).toBe('Unauthorized');
    });

    it('should handle HTTPException with 403 status', async () => {
      const app = createTestApp(() => new HTTPException(403, { message: 'Forbidden' }));
      const res = await app.request('/error');

      expect(res.status).toBe(403);
      const data = (await res.json()) as { success: boolean; message: string };
      expect(data.success).toBe(false);
      expect(data.message).toBe('Forbidden');
    });

    it('should handle HTTPException with 404 status', async () => {
      const app = createTestApp(() => new HTTPException(404, { message: 'Not Found' }));
      const res = await app.request('/error');

      expect(res.status).toBe(404);
      const data = (await res.json()) as { success: boolean; message: string };
      expect(data.success).toBe(false);
      expect(data.message).toBe('Not Found');
    });

    it('should handle HTTPException with 500 status', async () => {
      const app = createTestApp(() => new HTTPException(500, { message: 'Internal Server Error' }));
      const res = await app.request('/error');

      expect(res.status).toBe(500);
      const data = (await res.json()) as { success: boolean; message: string };
      expect(data.success).toBe(false);
      expect(data.message).toBe('Internal Server Error');
    });
  });

  describe('ZodError handling', () => {
    it('should handle ZodError with single issue', async () => {
      const schema = z.object({
        name: z.string().min(1)
      });

      const app = createTestApp(() => {
        const result = schema.safeParse({ name: '' });
        if (!result.success) {
          return result.error;
        }
        return new Error('Unexpected');
      });
      const res = await app.request('/error');

      expect(res.status).toBe(400);
      const data = (await res.json()) as {
        success: boolean;
        message: string;
        errors: Array<{ code: string; path: string[] }>;
      };
      expect(data.success).toBe(false);
      expect(data.message).toBe('Validation error');
      expect(data.errors).toBeDefined();
      expect(Array.isArray(data.errors)).toBe(true);
      expect(data.errors.length).toBeGreaterThan(0);
    });

    it('should handle ZodError with multiple issues', async () => {
      const schema = z.object({
        name: z.string().min(1),
        age: z.number().positive()
      });

      const app = createTestApp(() => {
        const result = schema.safeParse({ name: '', age: -1 });
        if (!result.success) {
          return result.error;
        }
        return new Error('Unexpected');
      });
      const res = await app.request('/error');

      expect(res.status).toBe(400);
      const data = (await res.json()) as {
        success: boolean;
        message: string;
        errors: Array<{ code: string; path: string[] }>;
      };
      expect(data.success).toBe(false);
      expect(data.message).toBe('Validation error');
      expect(data.errors.length).toBe(2);
    });
  });

  describe('Generic Error handling', () => {
    it('should handle generic Error with custom message', async () => {
      const app = createTestApp(() => new Error('Something went wrong'));
      const res = await app.request('/error');

      expect(res.status).toBe(500);
      const data = (await res.json()) as { success: boolean; message: string };
      expect(data.success).toBe(false);
      expect(data.message).toBe('Something went wrong');
    });

    it('should handle Error without message', async () => {
      const app = createTestApp(() => new Error());
      const res = await app.request('/error');

      expect(res.status).toBe(500);
      const data = (await res.json()) as { success: boolean; message: string };
      expect(data.success).toBe(false);
      // Empty error message results in empty string
      expect(data.message).toBe('');
    });
  });

  describe('Error logging', () => {
    it('should log errors to console', async () => {
      const error = new Error('Test error');
      const app = createTestApp(() => error);
      await app.request('/error');

      expect(consoleSpy).toHaveBeenCalledWith('[Error]', error);
    });
  });
});
