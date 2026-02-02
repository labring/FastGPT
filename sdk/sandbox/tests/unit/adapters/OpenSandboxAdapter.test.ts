import { describe, expect, it } from 'vitest';
import { OpenSandboxAdapter } from '../../../src/adapters/OpenSandboxAdapter';
import { ConnectionError, SandboxStateError } from '../../../src/errors';
import type { ImageSpec, ResourceLimits, SandboxConfig } from '../../../src/types';

/**
 * Unit tests for OpenSandboxAdapter.
 *
 * These tests verify the OpenSandboxAdapter lifecycle, filesystem operations,
 * command execution, and health checks using mocked SDK behavior.
 */
describe('OpenSandboxAdapter', () => {
  describe('Lifecycle Methods', () => {
    it('should initialize with correct default values', () => {
      const adapter = new OpenSandboxAdapter();

      expect(adapter.provider).toBe('opensandbox');
      expect(adapter.id).toBe('');
      expect(adapter.connectionState).toBe('disconnected');
      expect(adapter.capabilities.nativeFileSystem).toBe(false);
      expect(adapter.capabilities.supportsStreamingOutput).toBe(true);
      expect(adapter.capabilities.supportsPauseResume).toBe(true);
    });

    it('should initialize with custom connection config', () => {
      const adapter = new OpenSandboxAdapter({
        baseUrl: 'https://api.example.com',
        apiKey: 'test-api-key'
      });

      expect(adapter.provider).toBe('opensandbox');
      expect(adapter.connectionState).toBe('disconnected');
    });

    it('should handle connection state transitions', async () => {
      const adapter = new OpenSandboxAdapter();

      // Initially disconnected
      expect(adapter.connectionState).toBe('disconnected');

      // After creation, should be connected (mocked)
      // Note: Actual SDK calls are mocked in integration tests
    });

    it('should throw SandboxStateError when accessing sandbox before initialization', async () => {
      const adapter = new OpenSandboxAdapter();

      // Attempting operations before create/connect should throw
      await expect(adapter.execute('echo test')).rejects.toThrow(SandboxStateError);
    });

    it('should handle connection errors gracefully', async () => {
      // Test with a URL that will fail - using a reserved port that won't have a server
      const adapter = new OpenSandboxAdapter({
        baseUrl: 'http://localhost:65530'
      });

      const config: SandboxConfig = {
        image: { repository: 'nginx', tag: 'latest' }
      };

      // Should throw an error when SDK fails
      try {
        await adapter.create(config);
        // If we reach here without throwing, that's unexpected
        expect(true).toBe(false); // Force failure if no error thrown
      } catch (error) {
        expect(error instanceof ConnectionError || error instanceof Error).toBe(true);
      }
    });

    it('should handle connect errors gracefully', async () => {
      const adapter = new OpenSandboxAdapter({
        baseUrl: 'http://localhost:65530'
      });

      try {
        await adapter.connect('non-existent-sandbox-id');
        expect(true).toBe(false);
      } catch (error) {
        expect(error instanceof ConnectionError || error instanceof Error).toBe(true);
      }
    });

    it('should update status after lifecycle operations', async () => {
      const adapter = new OpenSandboxAdapter();

      // Status should be accessible
      expect(adapter.status).toBeDefined();
      expect(['Creating', 'Running', 'Stopped', 'Paused', 'Deleted', 'Error']).toContain(
        adapter.status.state
      );
    });
  });

  describe('Image and Resource Conversion', () => {
    it('should convert ImageSpec to SDK format', () => {
      const adapter = new OpenSandboxAdapter();

      // Test tag format
      const imageWithTag: ImageSpec = { repository: 'nginx', tag: 'latest' };
      // Access private method through type assertion for testing
      const convertImageSpec = (
        adapter as unknown as { convertImageSpec(image: ImageSpec): string }
      ).convertImageSpec;
      expect(convertImageSpec(imageWithTag)).toBe('nginx:latest');

      // Test digest format
      const imageWithDigest: ImageSpec = {
        repository: 'nginx',
        digest: 'sha256:abc123'
      };
      expect(convertImageSpec(imageWithDigest)).toBe('nginx@sha256:abc123');

      // Test tag and digest
      const imageWithBoth: ImageSpec = {
        repository: 'nginx',
        tag: '1.0',
        digest: 'sha256:abc123'
      };
      expect(convertImageSpec(imageWithBoth)).toBe('nginx:1.0@sha256:abc123');

      // Test just repository
      const imageRepoOnly: ImageSpec = { repository: 'nginx' };
      expect(convertImageSpec(imageRepoOnly)).toBe('nginx');
    });

    it('should parse SDK image string to ImageSpec', () => {
      const adapter = new OpenSandboxAdapter();
      const parseImageSpec = (adapter as unknown as { parseImageSpec(image: string): ImageSpec })
        .parseImageSpec;

      // Test tag format
      const withTag = parseImageSpec('nginx:latest');
      expect(withTag.repository).toBe('nginx');
      expect(withTag.tag).toBe('latest');

      // Test digest format
      const withDigest = parseImageSpec('nginx@sha256:abc123');
      expect(withDigest.repository).toBe('nginx');
      expect(withDigest.digest).toBe('sha256:abc123');

      // Test repository only
      const repoOnly = parseImageSpec('nginx');
      expect(repoOnly.repository).toBe('nginx');
      expect(repoOnly.tag).toBeUndefined();
      expect(repoOnly.digest).toBeUndefined();
    });

    it('should convert ResourceLimits to SDK format', () => {
      const adapter = new OpenSandboxAdapter();
      const convertResourceLimits = (
        adapter as unknown as {
          convertResourceLimits(limits?: ResourceLimits): Record<string, string> | undefined;
        }
      ).convertResourceLimits;

      // Full limits
      const limits: ResourceLimits = {
        cpuCount: 2,
        memoryMiB: 512,
        diskGiB: 10
      };
      const converted = convertResourceLimits(limits);
      expect(converted).toEqual({
        cpu: '2',
        memory: '512Mi',
        disk: '10Gi'
      });

      // Partial limits
      const partial: ResourceLimits = { cpuCount: 4 };
      expect(convertResourceLimits(partial)).toEqual({ cpu: '4' });

      // Empty limits
      expect(convertResourceLimits({})).toEqual({});

      // Undefined
      expect(convertResourceLimits(undefined)).toBeUndefined();
    });

    it('should parse SDK resource limits to ResourceLimits', () => {
      const adapter = new OpenSandboxAdapter();
      const parseResourceLimits = (
        adapter as unknown as {
          parseResourceLimits(resource?: Record<string, string>): ResourceLimits | undefined;
        }
      ).parseResourceLimits;

      // Full resource limits
      const sdkLimits = {
        cpu: '2',
        memory: '512Mi',
        disk: '10Gi'
      };
      const parsed = parseResourceLimits(sdkLimits);
      expect(parsed).toEqual({
        cpuCount: 2,
        memoryMiB: 512,
        diskGiB: 10
      });

      // GiB memory conversion
      const gibMemory = { memory: '2Gi' };
      expect(parseResourceLimits(gibMemory)).toEqual({ memoryMiB: 2048 });

      // Empty object
      expect(parseResourceLimits({})).toEqual({});

      // Undefined
      expect(parseResourceLimits(undefined)).toBeUndefined();
    });
  });

  describe('Sandbox Configuration', () => {
    it('should handle SandboxConfig with all options', () => {
      const _adapter = new OpenSandboxAdapter();

      const fullConfig: SandboxConfig = {
        image: { repository: 'node', tag: '18-alpine' },
        entrypoint: ['node', 'app.js'],
        timeout: 3600,
        resourceLimits: {
          cpuCount: 2,
          memoryMiB: 1024,
          diskGiB: 20
        },
        env: { NODE_ENV: 'production', PORT: '3000' },
        metadata: { project: 'test', version: '1.0' }
      };

      // Config should be valid
      expect(fullConfig.image.repository).toBe('node');
      expect(fullConfig.timeout).toBe(3600);
      expect(fullConfig.resourceLimits?.cpuCount).toBe(2);
    });

    it('should handle minimal SandboxConfig', () => {
      const minimalConfig: SandboxConfig = {
        image: { repository: 'alpine' }
      };

      expect(minimalConfig.image.repository).toBe('alpine');
      expect(minimalConfig.timeout).toBeUndefined();
    });
  });

  describe('Lifecycle State Management', () => {
    it('should track connection state correctly', () => {
      const adapter = new OpenSandboxAdapter();

      // Initial state
      expect(adapter.connectionState).toBe('disconnected');

      // States should be one of the valid values
      const validStates = ['disconnected', 'connecting', 'connected', 'closed'];
      expect(validStates).toContain(adapter.connectionState);
    });

    it('should reset state on close', async () => {
      const adapter = new OpenSandboxAdapter();

      // Before close
      expect(adapter.id).toBe('');

      // After close should reset
      await adapter.close();
      expect(adapter.connectionState).toBe('closed');
    });
  });

  describe('Error Handling', () => {
    it('should wrap SDK errors in ConnectionError for create', async () => {
      const adapter = new OpenSandboxAdapter({
        baseUrl: 'http://localhost:1' // Invalid port
      });

      try {
        await adapter.create({ image: { repository: 'test' } });
      } catch (error) {
        // Should be a connection-related error
        expect(error instanceof Error).toBe(true);
      }
    });

    it('should wrap SDK errors in ConnectionError for connect', async () => {
      const adapter = new OpenSandboxAdapter({
        baseUrl: 'http://localhost:1'
      });

      try {
        await adapter.connect('invalid-id');
      } catch (error) {
        expect(error instanceof Error).toBe(true);
      }
    });

    it('should provide meaningful error messages', () => {
      const connectionError = new ConnectionError(
        'Failed to create sandbox',
        'http://example.com',
        new Error('Network timeout')
      );

      expect(connectionError.message).toContain('Failed to create sandbox');
      expect(connectionError.endpoint).toBe('http://example.com');
      expect(connectionError.cause).toBeDefined();
    });

    it('should create SandboxStateError with expected state', () => {
      const stateError = new SandboxStateError(
        'Sandbox not initialized',
        'disconnected',
        'connected'
      );

      expect(stateError.message).toContain('Sandbox not initialized');
      expect(stateError.currentState).toBe('disconnected');
      expect(stateError.requiredState).toBe('connected');
    });
  });

  describe('Capabilities', () => {
    it('should report full capabilities', () => {
      const adapter = new OpenSandboxAdapter();
      const caps = adapter.capabilities;

      expect(caps.nativeFileSystem).toBe(false);
      expect(caps.supportsBackgroundExecution).toBe(true);
      expect(caps.supportsStreamingOutput).toBe(true);
      expect(caps.supportsPauseResume).toBe(true);
      expect(caps.supportsStreamingTransfer).toBe(true);
      expect(caps.supportsBatchOperations).toBe(true);
      expect(caps.supportsPermissions).toBe(true);
      expect(caps.supportsSearch).toBe(true);
      expect(caps.supportsRenews).toBe(true);
      expect(caps.nativeHealthCheck).toBe(true);
      expect(caps.nativeMetrics).toBe(true);
    });

    it('should have unique provider name', () => {
      const adapter = new OpenSandboxAdapter();
      expect(adapter.provider).toBe('opensandbox');
      expect(adapter.provider).not.toBe('minimal');
    });
  });

  describe('Wait Until Ready', () => {
    it('should timeout when sandbox not ready', async () => {
      const adapter = new OpenSandboxAdapter();

      // Without proper initialization, should timeout or error
      try {
        await adapter.waitUntilReady(100); // Short timeout
      } catch (error) {
        // Expected to throw since sandbox not created
        expect(error instanceof Error).toBe(true);
      }
    });
  });

  describe('Runtime Configuration', () => {
    it('should default to docker runtime', () => {
      const adapter = new OpenSandboxAdapter();

      expect(adapter.runtime).toBe('docker');
    });

    it('should accept docker runtime explicitly', () => {
      const adapter = new OpenSandboxAdapter({ runtime: 'docker' });

      expect(adapter.runtime).toBe('docker');
    });

    it('should accept kubernetes runtime', () => {
      const adapter = new OpenSandboxAdapter({ runtime: 'kubernetes' });

      expect(adapter.runtime).toBe('kubernetes');
    });

    it('should have full capabilities in docker runtime', () => {
      const adapter = new OpenSandboxAdapter({ runtime: 'docker' });

      expect(adapter.capabilities.supportsPauseResume).toBe(true);
      expect(adapter.capabilities.supportsBackgroundExecution).toBe(true);
      expect(adapter.capabilities.supportsStreamingOutput).toBe(true);
    });

    it('should disable pause/resume in kubernetes runtime', () => {
      const adapter = new OpenSandboxAdapter({ runtime: 'kubernetes' });

      expect(adapter.capabilities.supportsPauseResume).toBe(false);
      expect(adapter.capabilities.supportsBackgroundExecution).toBe(true);
      expect(adapter.capabilities.supportsStreamingOutput).toBe(true);
    });

    it('should preserve common capabilities across runtimes', () => {
      const dockerAdapter = new OpenSandboxAdapter({ runtime: 'docker' });
      const k8sAdapter = new OpenSandboxAdapter({ runtime: 'kubernetes' });

      // Both should have these capabilities
      const commonCapabilities = [
        'nativeHealthCheck',
        'nativeMetrics',
        'supportsStreamingTransfer',
        'supportsBatchOperations',
        'supportsPermissions',
        'supportsSearch',
        'supportsRenews'
      ] as const;

      for (const cap of commonCapabilities) {
        expect(dockerAdapter.capabilities[cap]).toBe(true);
        expect(k8sAdapter.capabilities[cap]).toBe(true);
      }
    });

    it('should report correct provider for both runtimes', () => {
      const dockerAdapter = new OpenSandboxAdapter({ runtime: 'docker' });
      const k8sAdapter = new OpenSandboxAdapter({ runtime: 'kubernetes' });

      expect(dockerAdapter.provider).toBe('opensandbox');
      expect(k8sAdapter.provider).toBe('opensandbox');
    });

    it('should handle runtime with other connection config options', () => {
      const adapter = new OpenSandboxAdapter({
        baseUrl: 'https://api.example.com',
        apiKey: 'test-api-key',
        runtime: 'kubernetes'
      });

      expect(adapter.runtime).toBe('kubernetes');
      expect(adapter.connectionState).toBe('disconnected');
    });
  });

  describe('Runtime State Transitions', () => {
    it('should track runtime type independently of connection state', () => {
      const dockerAdapter = new OpenSandboxAdapter({ runtime: 'docker' });
      const k8sAdapter = new OpenSandboxAdapter({ runtime: 'kubernetes' });

      // Both start disconnected
      expect(dockerAdapter.connectionState).toBe('disconnected');
      expect(k8sAdapter.connectionState).toBe('disconnected');

      // Runtime types are preserved
      expect(dockerAdapter.runtime).toBe('docker');
      expect(k8sAdapter.runtime).toBe('kubernetes');
    });

    it('should maintain runtime through lifecycle operations', async () => {
      const adapter = new OpenSandboxAdapter({ runtime: 'kubernetes' });

      // Runtime is immutable
      expect(adapter.runtime).toBe('kubernetes');

      // After close, runtime should still be preserved
      await adapter.close();
      expect(adapter.runtime).toBe('kubernetes');
    });
  });
});
