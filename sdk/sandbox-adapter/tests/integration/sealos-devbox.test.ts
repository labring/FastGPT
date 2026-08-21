import { afterAll, beforeAll, describe, expect } from 'vitest';
import { SealosDevboxAdapter, type SealosDevboxConfig } from '@/adapters/sealos-devbox';
import { describeSandboxContract } from './suites';

const SANDBOX_URL = process.env.SEALOS_DEVBOX_SERVER_URL;
const SANDBOX_TOKEN = process.env.SEALOS_DEVBOX_SERVER_TOKEN;

const shouldRun = Boolean(SANDBOX_URL && SANDBOX_TOKEN);

describe.skipIf(!shouldRun).sequential('SealosDevboxAdapter Integration Tests', () => {
  if (!shouldRun) {
    return;
  }

  const devboxName = 'test-devbox';

  const config: SealosDevboxConfig = {
    baseUrl: SANDBOX_URL!,
    token: SANDBOX_TOKEN!,
    sandboxId: devboxName
  };

  const adapter = new SealosDevboxAdapter(config);

  beforeAll(async () => {
    await adapter.ensureRunning();
    expect(adapter.status.state).toBe('Running');
  });

  afterAll(async () => {
    await adapter.delete().catch(() => undefined);
  });

  describeSandboxContract(() => adapter);
});
