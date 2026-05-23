import { describe, expect, it } from 'vitest';
import { OpenSandboxAdapter } from '@/adapters/OpenSandboxAdapter';
import { createSandbox, type SandboxProviderType } from '@/index';
import type { OpenSandboxConfigType } from '@/adapters/OpenSandboxAdapter/type';

describe('createSandbox', () => {
  it('should create OpenSandbox adapter', () => {
    const sandbox = createSandbox(
      'opensandbox',
      {
        baseUrl: 'http://localhost:8080',
        apiKey: 'test-key',
        sessionId: 'test-session'
      },
      {
        image: {
          repository: 'test',
          tag: 'latest'
        }
      }
    );

    expect(sandbox).toBeInstanceOf(OpenSandboxAdapter);
    expect(sandbox.provider).toBe('opensandbox');
  });

  it('should throw error for unknown provider', () => {
    expect(() =>
      createSandbox(
        'unknown' as SandboxProviderType,
        {} as never,
        {
          image: { repository: 'test', tag: 'latest' }
        } as unknown as OpenSandboxConfigType
      )
    ).toThrow('Unknown provider');
  });
});
