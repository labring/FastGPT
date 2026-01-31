import { describe, expect, it } from 'vitest';
import { MinimalProviderAdapter, OpenSandboxAdapter } from '../../../src/adapters';
import { createSandbox, SandboxProviderFactory } from '../../../src/factory/SandboxProviderFactory';

describe('SandboxProviderFactory', () => {
  describe('create', () => {
    it('should create OpenSandbox adapter', () => {
      const sandbox = SandboxProviderFactory.create({
        provider: 'opensandbox',
        connection: {
          baseUrl: 'http://localhost:8080',
          apiKey: 'test-key'
        }
      });

      expect(sandbox).toBeInstanceOf(OpenSandboxAdapter);
      expect(sandbox.provider).toBe('opensandbox');
      expect(sandbox.capabilities.nativeFileSystem).toBe(false);
    });

    it('should create minimal provider adapter', () => {
      const sandbox = SandboxProviderFactory.create({
        provider: 'minimal'
      });

      expect(sandbox).toBeInstanceOf(MinimalProviderAdapter);
      expect(sandbox.provider).toBe('minimal');
      expect(sandbox.capabilities.nativeFileSystem).toBe(false);
    });

    it('should throw error for unknown provider', () => {
      try {
        SandboxProviderFactory.create({
          provider: 'unknown'
        });
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Unknown provider');
      }
    });
  });

  describe('getAvailableProviders', () => {
    it('should list available providers', () => {
      const providers = SandboxProviderFactory.getAvailableProviders();

      expect(providers).toContain('opensandbox');
      expect(providers).toContain('minimal');
    });
  });

  describe('registerProvider', () => {
    it('should allow registering custom providers', () => {
      const customFactory = () => new MinimalProviderAdapter();

      SandboxProviderFactory.registerProvider('custom', customFactory);

      const sandbox = SandboxProviderFactory.create({
        provider: 'custom'
      });

      expect(sandbox).toBeDefined();

      // Should now be in available providers
      const providers = SandboxProviderFactory.getAvailableProviders();
      expect(providers).toContain('custom');
    });
  });
});

describe('createSandbox convenience function', () => {
  it('should work as shorthand for factory.create', () => {
    const sandbox = createSandbox({
      provider: 'opensandbox'
    });

    expect(sandbox).toBeInstanceOf(OpenSandboxAdapter);
  });
});
