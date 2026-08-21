import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { describeSandboxContract } from './suites';
import {
  OpenSandboxAdapter,
  type OpenSandboxConfigType,
  type OpenSandboxConnectionConfig
} from '@/adapters';
import type { SandboxRuntimeType } from '@/adapters/opensandbox';

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
    timeoutSeconds: 600,
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
    await adapter.delete().catch(() => undefined);
    await adapter.close().catch(() => undefined);
  }, 130_000);

  describe('Lifecycle Stop', () => {
    it('deletes on stop and creates a new sandbox when ensured again', async () => {
      const sandboxId = adapter.id;
      expect(sandboxId).toBeDefined();

      await adapter.stop();
      expect(adapter.status.state).toBe('UnExist');
      expect(adapter.id).toBeUndefined();

      await adapter.close();
      await adapter.ensureRunning();

      expect(adapter.status.state).toBe('Running');
      expect(adapter.id).toBeDefined();
      expect(adapter.id).not.toBe(sandboxId);
    }, 90_000);
  });

  describeSandboxContract(() => adapter);
});
