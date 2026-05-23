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
  const runResourceLimitChecks = process.env.OPENSANDBOX_INTEGRATION_RESOURCE_LIMITS === 'true';
  const runNetworkIsolationChecks =
    process.env.OPENSANDBOX_INTEGRATION_NETWORK_ISOLATION === 'true';
  const runContainerSecurityChecks =
    process.env.OPENSANDBOX_INTEGRATION_CONTAINER_SECURITY === 'true';
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
  const localNetworkDenyPolicy: OpenSandboxConfigType['networkPolicy'] = {
    defaultAction: 'allow',
    egress: [
      { action: 'deny', target: 'localhost' },
      { action: 'deny', target: 'host.docker.internal' },
      { action: 'deny', target: 'host.orb.internal' },
      { action: 'deny', target: 'docker.orb.internal' },
      { action: 'deny', target: 'gateway.orb.internal' },
      { action: 'deny', target: 'proxyproxy.orb.internal' },
      { action: 'deny', target: '*.orb.internal' },
      { action: 'deny', target: '*.orb.local' }
    ]
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

  describe('Security Runtime Tests', () => {
    it.runIf(runContainerSecurityChecks)(
      'should run as non-root and keep sandbox workspaces writable',
      async () => {
        const result = await adapter.execute(
          'test "$(id -u)" != "0" && test "$(id -un)" = "sandbox" && test -w /home/sandbox && test -w /workspace && touch /home/sandbox/.write-check /workspace/.write-check',
          { timeoutMs: 5_000, maxOutputBytes: 4096 }
        );

        expect(result.exitCode).toBe(0);
      },
      15_000
    );

    it('should enforce command timeout in real OpenSandbox', async () => {
      const startedAt = Date.now();
      let result:
        | Awaited<ReturnType<OpenSandboxAdapter['execute']>>
        | { exitCode: number; stderr: string }
        | undefined;

      try {
        result = await adapter.execute('sleep 10', { timeoutMs: 1_000 });
      } catch (error) {
        result = {
          exitCode: -1,
          stderr: error instanceof Error ? error.message : String(error)
        };
      }

      expect(Date.now() - startedAt).toBeLessThan(5_000);
      expect(result?.exitCode).not.toBe(0);
    }, 15_000);

    it.runIf(runResourceLimitChecks)(
      'should create sandbox with enforced memory limit',
      async () => {
        const memoryMiB = 256;
        const limitedAdapter = new OpenSandboxAdapter(
          {
            ...connectionConfig,
            sessionId: crypto.randomUUID()
          },
          {
            ...createConfig,
            resourceLimits: {
              cpuCount: 1,
              memoryMiB
            }
          }
        );

        try {
          await limitedAdapter.ensureRunning();
          const result = await limitedAdapter.execute(
            'cat /sys/fs/cgroup/memory.max 2>/dev/null || cat /sys/fs/cgroup/memory/memory.limit_in_bytes 2>/dev/null || true',
            { timeoutMs: 3_000, maxOutputBytes: 1024 }
          );
          const rawLimit = result.stdout.trim();
          const limitBytes = Number(rawLimit);

          expect(rawLimit).not.toBe('');
          expect(rawLimit).not.toBe('max');
          expect(Number.isFinite(limitBytes)).toBe(true);
          expect(limitBytes).toBeLessThanOrEqual((memoryMiB + 16) * 1024 * 1024);
        } finally {
          await limitedAdapter.delete().catch(() => undefined);
        }
      },
      120_000
    );

    it.runIf(runNetworkIsolationChecks)(
      'should deny local network while allowing public internet',
      async () => {
        const networkAdapter = new OpenSandboxAdapter(
          {
            ...connectionConfig,
            sessionId: crypto.randomUUID()
          },
          {
            ...createConfig,
            networkPolicy: localNetworkDenyPolicy
          }
        );

        try {
          await networkAdapter.ensureRunning();

          const publicResult = await networkAdapter.execute(
            'curl -fsS --max-time 5 https://example.com >/dev/null',
            { timeoutMs: 8_000, maxOutputBytes: 4096 }
          );
          expect(publicResult.exitCode).toBe(0);

          const gatewayResult = await networkAdapter.execute(
            `python3 - <<'PY'
from pathlib import Path
for line in Path('/proc/net/route').read_text().splitlines()[1:]:
    fields = line.split()
    if len(fields) >= 3 and fields[1] == '00000000':
        raw = fields[2]
        print('.'.join(str(int(raw[i:i+2], 16)) for i in (6, 4, 2, 0)))
        break
PY`,
            { timeoutMs: 5_000, maxOutputBytes: 1024 }
          );
          const gateway = gatewayResult.stdout.trim();

          expect(gatewayResult.exitCode).toBe(0);
          expect(gateway).not.toBe('');

          const blockedCommands = [
            'curl -fsS --max-time 3 http://host.docker.internal:8090/health >/dev/null',
            `curl -fsS --max-time 3 http://${gateway}:8090/health >/dev/null`
          ];

          for (const command of blockedCommands) {
            const result = await networkAdapter.execute(command, {
              timeoutMs: 5_000,
              maxOutputBytes: 4096
            });
            expect(result.exitCode).not.toBe(0);
          }
        } finally {
          await networkAdapter.delete().catch(() => undefined);
        }
      },
      90_000
    );
  });

  describeSandboxContract({
    getAdapter: () => adapter,
    supportsStartAfterStop: false
  });
});
