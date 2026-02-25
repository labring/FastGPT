import { describe, it, expect } from 'vitest';
import { app } from '../src/index';

describe('App', () => {
  describe('GET /health', () => {
    it('should return health status', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);

      const data = (await res.json()) as { status: string; timestamp: string };
      expect(data.status).toBe('ok');
      expect(data.timestamp).toBeDefined();
    });
  });

  describe('GET /openapi', () => {
    it('should return OpenAPI document', async () => {
      const res = await app.request('/openapi');
      expect(res.status).toBe(200);

      const data = (await res.json()) as { openapi: string; info: { title: string } };
      expect(data.openapi).toBe('3.0.0');
      expect(data.info.title).toBe('Sandbox Server API');
    });
  });

  describe('Protected routes', () => {
    it('should return 401 without authorization header', async () => {
      const res = await app.request('/v1/containers/test');
      expect(res.status).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const res = await app.request('/v1/containers/test', {
        headers: {
          Authorization: 'Bearer invalid-token'
        }
      });
      expect(res.status).toBe(401);
    });
  });
});
