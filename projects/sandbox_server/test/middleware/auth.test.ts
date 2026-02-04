import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { authMiddleware } from '../../src/middleware/auth';
import { errorHandler } from '../../src/middleware/error';

describe('Auth Middleware', () => {
  const createTestApp = () => {
    const app = new Hono();
    app.onError(errorHandler);
    app.use('*', authMiddleware);
    app.get('/protected', (c) => c.json({ success: true }));
    return app;
  };

  describe('Authorization header validation', () => {
    it('should return 401 when Authorization header is missing', async () => {
      const app = createTestApp();
      const res = await app.request('/protected');

      expect(res.status).toBe(401);
      const data = (await res.json()) as { message: string };
      expect(data.message).toBe('Authorization header is required');
    });

    it('should return 401 when Authorization format is invalid (no Bearer prefix)', async () => {
      const app = createTestApp();
      const res = await app.request('/protected', {
        headers: {
          Authorization: 'test-token'
        }
      });

      expect(res.status).toBe(401);
      const data = (await res.json()) as { message: string };
      expect(data.message).toBe('Invalid authorization format. Expected: Bearer <token>');
    });

    it('should return 401 when Authorization format is invalid (wrong prefix)', async () => {
      const app = createTestApp();
      const res = await app.request('/protected', {
        headers: {
          Authorization: 'Basic test-token'
        }
      });

      expect(res.status).toBe(401);
      const data = (await res.json()) as { message: string };
      expect(data.message).toBe('Invalid authorization format. Expected: Bearer <token>');
    });
  });

  describe('Token validation', () => {
    it('should return 401 when token is invalid', async () => {
      const app = createTestApp();
      const res = await app.request('/protected', {
        headers: {
          Authorization: 'Bearer invalid-token'
        }
      });

      expect(res.status).toBe(401);
      const data = (await res.json()) as { message: string };
      expect(data.message).toBe('Invalid token');
    });

    it('should return 401 when token is empty', async () => {
      const app = createTestApp();
      const res = await app.request('/protected', {
        headers: {
          Authorization: 'Bearer '
        }
      });

      expect(res.status).toBe(401);
      const data = (await res.json()) as { message: string };
      // Note: 'Bearer ' (with trailing space but no token) is treated as invalid format
      expect(data.message).toBe('Invalid authorization format. Expected: Bearer <token>');
    });

    it('should allow request with valid token', async () => {
      const app = createTestApp();
      const res = await app.request('/protected', {
        headers: {
          Authorization: 'Bearer test-token' // matches env.TOKEN in test mode
        }
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { success: boolean };
      expect(data.success).toBe(true);
    });
  });
});
