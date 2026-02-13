import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { createSDK, createSDKFromConfig } from '../../sdk/index';
import type { ExecRequest } from '../../src/schemas';

describe('Sandbox Server SDK', () => {
  const baseUrl = 'http://localhost:3000';
  const token = 'test-token';

  beforeEach(() => {
    // Clean all HTTP mocks before each test
    nock.cleanAll();
  });

  afterEach(() => {
    // Verify that all expected HTTP calls were made
    if (!nock.isDone()) {
      const pendingMocks = nock.pendingMocks();
      if (pendingMocks.length > 0) {
        console.warn('Pending mocks:', pendingMocks);
      }
    }
    nock.cleanAll();
  });

  describe('SDK Initialization', () => {
    it('should create SDK with correct structure', () => {
      const sdk = createSDK(baseUrl, token);

      expect(sdk.container).toBeDefined();
      expect(sdk.sandbox).toBeDefined();
      expect(sdk.container.create).toBeInstanceOf(Function);
      expect(sdk.container.get).toBeInstanceOf(Function);
      expect(sdk.container.pause).toBeInstanceOf(Function);
      expect(sdk.container.start).toBeInstanceOf(Function);
      expect(sdk.container.delete).toBeInstanceOf(Function);
      expect(sdk.sandbox.exec).toBeInstanceOf(Function);
      expect(sdk.sandbox.health).toBeInstanceOf(Function);
    });

    it('should create SDK from config object', () => {
      const config = { baseUrl, token };
      const sdk = createSDKFromConfig(config);

      expect(sdk.container).toBeDefined();
      expect(sdk.sandbox).toBeDefined();
    });
  });

  describe('ContainerSDK', () => {
    let sdk: ReturnType<typeof createSDK>;

    beforeEach(() => {
      sdk = createSDK(baseUrl, token);
    });

    describe('create', () => {
      it('should send POST request to /v1/containers with name only', async () => {
        const params = { name: 'test-container' };

        const scope = nock(baseUrl)
          .post('/v1/containers', (body) => {
            // Verify request body only contains name
            expect(body).toMatchObject(params);
            return true;
          })
          .matchHeader('authorization', `Bearer ${token}`)
          .matchHeader('content-type', 'application/json')
          .reply(200, { success: true });

        await sdk.container.create(params);

        expect(scope.isDone()).toBe(true);
      });
    });

    describe('get', () => {
      it('should send GET request to /v1/containers/:name with encoded name', async () => {
        const containerName = 'test-container';
        const mockResponse = {
          success: true,
          data: {
            name: containerName,
            image: { imageName: 'node:18' },
            status: { state: 'Running' }
          }
        };

        const scope = nock(baseUrl)
          .get(`/v1/containers/${encodeURIComponent(containerName)}`)
          .matchHeader('authorization', `Bearer ${token}`)
          .reply(200, mockResponse);

        const result = await sdk.container.get(containerName);

        expect(scope.isDone()).toBe(true);
        expect(result).toBeDefined();
        expect(result?.name).toBe(containerName);
      });

      it('should handle special characters in container name', async () => {
        const containerName = 'test-container@123';
        const mockResponse = {
          success: true,
          data: {
            name: containerName,
            image: { imageName: 'node:18' },
            status: { state: 'Running' }
          }
        };

        const scope = nock(baseUrl)
          .get(`/v1/containers/${encodeURIComponent(containerName)}`)
          .matchHeader('authorization', `Bearer ${token}`)
          .reply(200, mockResponse);

        await sdk.container.get(containerName);

        expect(scope.isDone()).toBe(true);
      });

      it('should return null for 404 error', async () => {
        const containerName = 'non-existent';

        const scope = nock(baseUrl)
          .get(`/v1/containers/${encodeURIComponent(containerName)}`)
          .matchHeader('authorization', `Bearer ${token}`)
          .reply(404, { success: false, message: 'Not found' });

        const result = await sdk.container.get(containerName);

        expect(scope.isDone()).toBe(true);
        expect(result).toBeNull();
      });
    });

    describe('pause', () => {
      it('should send POST request to /v1/containers/:name/pause', async () => {
        const containerName = 'test-container';

        const scope = nock(baseUrl)
          .post(`/v1/containers/${encodeURIComponent(containerName)}/pause`)
          .matchHeader('authorization', `Bearer ${token}`)
          .reply(200, { success: true });

        await sdk.container.pause(containerName);

        expect(scope.isDone()).toBe(true);
      });
    });

    describe('start', () => {
      it('should send POST request to /v1/containers/:name/start', async () => {
        const containerName = 'test-container';

        const scope = nock(baseUrl)
          .post(`/v1/containers/${encodeURIComponent(containerName)}/start`)
          .matchHeader('authorization', `Bearer ${token}`)
          .reply(200, { success: true });

        await sdk.container.start(containerName);

        expect(scope.isDone()).toBe(true);
      });
    });

    describe('delete', () => {
      it('should send DELETE request to /v1/containers/:name', async () => {
        const containerName = 'test-container';

        const scope = nock(baseUrl)
          .delete(`/v1/containers/${encodeURIComponent(containerName)}`)
          .matchHeader('authorization', `Bearer ${token}`)
          .reply(200, { success: true });

        await sdk.container.delete(containerName);

        expect(scope.isDone()).toBe(true);
      });
    });
  });

  describe('SandboxSDK', () => {
    let sdk: ReturnType<typeof createSDK>;

    beforeEach(() => {
      sdk = createSDK(baseUrl, token);
    });

    describe('exec', () => {
      it('should send POST request to /v1/sandbox/:name/exec with correct params', async () => {
        const sandboxName = 'test-sandbox';
        const execParams: ExecRequest = {
          command: 'ls -la',
          cwd: '/app'
        };

        const mockResponse = {
          success: true,
          data: {
            success: true,
            stdout: 'file1.txt\nfile2.txt',
            stderr: '',
            exitCode: 0,
            cwd: '/app'
          }
        };

        const scope = nock(baseUrl)
          .post(`/v1/sandbox/${encodeURIComponent(sandboxName)}/exec`, (body) => {
            expect(body).toMatchObject(execParams);
            return true;
          })
          .matchHeader('authorization', `Bearer ${token}`)
          .matchHeader('content-type', 'application/json')
          .reply(200, mockResponse);

        const result = await sdk.sandbox.exec(sandboxName, execParams);

        expect(scope.isDone()).toBe(true);
        expect(result.stdout).toBe('file1.txt\nfile2.txt');
        expect(result.exitCode).toBe(0);
      });

      it('should send POST request with command only (no cwd)', async () => {
        const sandboxName = 'test-sandbox';
        const execParams: ExecRequest = {
          command: 'pwd'
        };

        const mockResponse = {
          success: true,
          data: {
            success: true,
            stdout: '/app',
            stderr: '',
            exitCode: 0
          }
        };

        const scope = nock(baseUrl)
          .post(`/v1/sandbox/${encodeURIComponent(sandboxName)}/exec`, (body) => {
            expect(body.command).toBe(execParams.command);
            expect(body).not.toHaveProperty('cwd');
            return true;
          })
          .matchHeader('authorization', `Bearer ${token}`)
          .reply(200, mockResponse);

        await sdk.sandbox.exec(sandboxName, execParams);

        expect(scope.isDone()).toBe(true);
      });

      it('should handle special characters in sandbox name', async () => {
        const sandboxName = 'test-sandbox@v1.0';
        const execParams: ExecRequest = {
          command: 'echo hello'
        };

        const mockResponse = {
          success: true,
          data: {
            success: true,
            stdout: 'hello',
            stderr: '',
            exitCode: 0
          }
        };

        const scope = nock(baseUrl)
          .post(`/v1/sandbox/${encodeURIComponent(sandboxName)}/exec`)
          .matchHeader('authorization', `Bearer ${token}`)
          .reply(200, mockResponse);

        await sdk.sandbox.exec(sandboxName, execParams);

        expect(scope.isDone()).toBe(true);
      });
    });

    describe('health', () => {
      it('should send GET request to /v1/sandbox/:name/health', async () => {
        const sandboxName = 'test-sandbox';

        const mockResponse = {
          success: true,
          healthy: true
        };

        const scope = nock(baseUrl)
          .get(`/v1/sandbox/${encodeURIComponent(sandboxName)}/health`)
          .matchHeader('authorization', `Bearer ${token}`)
          .reply(200, mockResponse);

        const result = await sdk.sandbox.health(sandboxName);

        expect(scope.isDone()).toBe(true);
        expect(result).toBe(true);
      });

      it('should return false when sandbox is unhealthy', async () => {
        const sandboxName = 'test-sandbox';

        const mockResponse = {
          success: true,
          healthy: false
        };

        const scope = nock(baseUrl)
          .get(`/v1/sandbox/${encodeURIComponent(sandboxName)}/health`)
          .matchHeader('authorization', `Bearer ${token}`)
          .reply(200, mockResponse);

        const result = await sdk.sandbox.health(sandboxName);

        expect(scope.isDone()).toBe(true);
        expect(result).toBe(false);
      });

      it('should handle special characters in sandbox name', async () => {
        const sandboxName = 'test-sandbox@v1.0';

        const mockResponse = {
          success: true,
          healthy: true
        };

        const scope = nock(baseUrl)
          .get(`/v1/sandbox/${encodeURIComponent(sandboxName)}/health`)
          .matchHeader('authorization', `Bearer ${token}`)
          .reply(200, mockResponse);

        await sdk.sandbox.health(sandboxName);

        expect(scope.isDone()).toBe(true);
      });
    });
  });

  describe('Request Headers and Configuration', () => {
    it('should include authorization header in all requests', async () => {
      const sdk = createSDK(baseUrl, token);
      const customToken = 'custom-token-123';
      const sdkWithCustomToken = createSDK(baseUrl, customToken);

      const scope1 = nock(baseUrl)
        .post('/v1/containers')
        .matchHeader('authorization', `Bearer ${token}`)
        .reply(200, { success: true });

      const scope2 = nock(baseUrl)
        .post('/v1/containers')
        .matchHeader('authorization', `Bearer ${customToken}`)
        .reply(200, { success: true });

      await sdk.container.create({ name: 'test1' });

      await sdkWithCustomToken.container.create({ name: 'test2' });

      expect(scope1.isDone()).toBe(true);
      expect(scope2.isDone()).toBe(true);
    });

    it('should include content-type header in POST requests', async () => {
      const sdk = createSDK(baseUrl, token);

      const scope = nock(baseUrl)
        .post('/v1/containers')
        .matchHeader('content-type', /application\/json/)
        .reply(200, { success: true });

      await sdk.container.create({ name: 'test' });

      expect(scope.isDone()).toBe(true);
    });

    it('should handle baseUrl with trailing slash', async () => {
      const urlWithSlash = 'http://localhost:3000/';
      const sdk = createSDK(urlWithSlash, token);

      // Should still make request to correct URL (without double slash)
      const scope = nock('http://localhost:3000')
        .get('/v1/sandbox/test/health')
        .reply(200, { success: true, healthy: true });

      await sdk.sandbox.health('test');

      expect(scope.isDone()).toBe(true);
    });
  });

  describe('URL Encoding', () => {
    let sdk: ReturnType<typeof createSDK>;

    beforeEach(() => {
      sdk = createSDK(baseUrl, token);
    });

    it('should properly encode container names with spaces', async () => {
      const name = 'my container';
      const encoded = encodeURIComponent(name);

      const scope = nock(baseUrl)
        .get(`/v1/containers/${encoded}`)
        .reply(200, {
          success: true,
          data: {
            name: name,
            image: { imageName: 'node:18' },
            status: { state: 'Running' }
          }
        });

      await sdk.container.get(name);

      expect(scope.isDone()).toBe(true);
    });

    it('should properly encode container names with special chars', async () => {
      const name = 'container/name@v1.0';
      const encoded = encodeURIComponent(name);

      const scope = nock(baseUrl)
        .get(`/v1/containers/${encoded}`)
        .reply(200, {
          success: true,
          data: {
            name: name,
            image: { imageName: 'node:18' },
            status: { state: 'Running' }
          }
        });

      await sdk.container.get(name);

      expect(scope.isDone()).toBe(true);
    });

    it('should properly encode sandbox names with unicode chars', async () => {
      const name = '测试-sandbox';
      const encoded = encodeURIComponent(name);

      const scope = nock(baseUrl)
        .get(`/v1/sandbox/${encoded}/health`)
        .reply(200, { success: true, healthy: true });

      await sdk.sandbox.health(name);

      expect(scope.isDone()).toBe(true);
    });
  });

  describe('Base URL Configuration', () => {
    it('should use correct base URL /v1 prefix', async () => {
      const sdk = createSDK(baseUrl, token);

      // Should request to /v1/containers, not /containers
      const scope = nock(baseUrl)
        .get('/v1/containers/test')
        .reply(200, {
          success: true,
          data: {
            name: 'test',
            image: { imageName: 'node:18' },
            status: { state: 'Running' }
          }
        });

      await sdk.container.get('test');

      expect(scope.isDone()).toBe(true);
    });

    it('should work with different ports', async () => {
      const customBaseUrl = 'http://localhost:8080';
      const sdk = createSDK(customBaseUrl, token);

      const scope = nock(customBaseUrl)
        .get('/v1/sandbox/test/health')
        .reply(200, { success: true, healthy: true });

      await sdk.sandbox.health('test');

      expect(scope.isDone()).toBe(true);
    });
  });
});
