import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { describeSandboxContract } from './suites';
import {
  OpenSandboxAdapter,
  type OpenSandboxConfigType,
  type OpenSandboxConnectionConfig
} from '@/adapters';
import type { SandboxRuntimeType } from '@/adapters/OpenSandboxAdapter';

const shouldRun = Boolean(
  process.env.OPENSANDBOX_BASE_URL &&
  process.env.OPENSANDBOX_IMAGE_REPOSITORY &&
  process.env.OPENSANDBOX_RUNTIME
);

describe.skipIf(!shouldRun).sequential('OpenSandboxAdapter Integration Tests', () => {
  const sessionId = crypto.randomUUID();
  const connectionConfig: OpenSandboxConnectionConfig = {
    sessionId,
    baseUrl: process.env.OPENSANDBOX_BASE_URL!,
    apiKey: process.env.OPENSANDBOX_API_KEY,
    runtime: process.env.OPENSANDBOX_RUNTIME as SandboxRuntimeType,
    useServerProxy: true,
    requestTimeoutSeconds: 60
  };
  const createConfig: OpenSandboxConfigType = {
    timeout: 600,
    readyTimeoutSeconds: 60,
    healthCheckPollingInterval: 500,
    image: {
      repository: process.env.OPENSANDBOX_IMAGE_REPOSITORY!,
      tag: process.env.OPENSANDBOX_IMAGE_TAG!
    },
    metadata: {
      skillId: crypto.randomUUID(),
      teamId: crypto.randomUUID()
    }
  };

  const adapter = new OpenSandboxAdapter(connectionConfig, createConfig);

  beforeAll(async () => {
    await adapter.ensureRunning();
    expect(adapter.status.state).toBe('Running');
  }, 90_000);

  afterAll(async () => {
    try {
      await adapter.delete();
    } catch (error) {
      console.error('Error during cleanup', error);
    }
  }, 30_000);

  describe('Basic Tests', () => {
    it('should initialize with the expected OpenSandbox configuration', () => {
      expect(adapter.provider).toBe('opensandbox');
      expect(adapter.runtime).toBe(process.env.OPENSANDBOX_RUNTIME);
    });
  });

  describeSandboxContract({
    getAdapter: () => adapter,
    supportsStartAfterStop: false
  });
});
