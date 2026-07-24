import { describe, expect, it } from 'vitest';
import {
  OpenSandboxAdapter,
  SealosDevboxAdapter,
  createSandbox,
  type SandboxProviderType
} from '@/index';

describe('createSandbox', () => {
  it('constructs the requested provider', () => {
    const openSandbox = createSandbox({
      provider: 'opensandbox',
      connectionConfig: {
        baseUrl: 'http://localhost:8080',
        apiKey: 'test-key',
        sessionId: 'test-session'
      },
      createConfig: { image: { repository: 'node', tag: '20' } }
    });
    const sealos = createSandbox({
      provider: 'sealosdevbox',
      connectionConfig: {
        baseUrl: 'http://localhost:8080',
        token: 'token',
        sandboxId: 'sandbox-1'
      },
      createConfig: { image: { repository: 'node', tag: '20' } }
    });

    expect(openSandbox).toBeInstanceOf(OpenSandboxAdapter);
    expect(sealos).toBeInstanceOf(SealosDevboxAdapter);
  });

  it('rejects unknown providers', () => {
    expect(() => createSandbox({ provider: 'unknown' as SandboxProviderType } as never)).toThrow(
      'Unknown sandbox provider'
    );
  });
});
