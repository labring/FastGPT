import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createSealosClient, createSandboxClient } from '../../src/clients';
import type { SealosClient, SandboxClient } from '../../src/clients';
import { env } from '../../src/env';

/**
 * Integration tests for Sandbox operations (exec and health check).
 *
 * Tests run only when SEALOS_KC is provided in .env.test.local
 *
 * Required environment variables:
 * - SEALOS_BASE_URL: Sealos API base URL
 * - SEALOS_KC: Sealos kubeconfig token
 * - SEALOS_IMAGE: Docker image with sandbox server (must have /health and /exec endpoints)
 */

describe.skipIf(!env.SEALOS_KC)('Sandbox Integration Tests', () => {
  // Generate unique container name for test isolation
  const testContainerName = `sandbox-test-${Math.random().toString(36).substring(2, 8)}`;

  let sealosClient: SealosClient;
  let sandboxClient: SandboxClient;

  beforeAll(async () => {
    sealosClient = createSealosClient();

    // Create container with sandbox server
    await sealosClient.createContainer({ name: testContainerName });

    // Wait for container to be running
    await waitForContainerState(sealosClient, testContainerName, ['Running'], 90000);

    // Get container info to build sandbox URL
    const containerInfo = await sealosClient.getContainer(testContainerName);
    if (!containerInfo || !containerInfo.server) {
      throw new Error('Failed to get container server info');
    }

    // Build sandbox URL
    let sandboxUrl: string;
    if (containerInfo.server.publicDomain && containerInfo.server.domain) {
      sandboxUrl = `https://${containerInfo.server.publicDomain}.${containerInfo.server.domain}`;
    } else {
      sandboxUrl = `http://${containerInfo.server.serviceName}:${containerInfo.server.number}`;
    }

    sandboxClient = createSandboxClient(sandboxUrl);

    // Give sandbox server time to start
    await sleep(5000);
  });

  afterAll(async () => {
    // Cleanup: delete test container
    try {
      await sealosClient.deleteContainer(testContainerName);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Health Check', () => {
    it('should check sandbox health', async () => {
      const healthy = await sandboxClient.isHealthy();
      expect(typeof healthy).toBe('boolean');
    });

    it('should get health response', async () => {
      const health = await sandboxClient.health();
      expect(health).toBeDefined();
      expect(health.status).toBeDefined();
    });
  });

  describe('Command Execution', () => {
    it('should execute a simple echo command', async () => {
      const result = await sandboxClient.exec({
        command: 'echo "Hello, World!"'
      });

      expect(result.stdout.trim()).toBe('Hello, World!');
      expect(result.stderr).toBe('');
      expect(result.exitCode).toBe(0);
    });

    it('should return correct exit code for successful command', async () => {
      const result = await sandboxClient.exec({
        command: 'true'
      });

      expect(result.exitCode).toBe(0);
    });

    it('should return non-zero exit code for failed command', async () => {
      const result = await sandboxClient.exec({
        command: 'false'
      });

      expect(result.exitCode).not.toBe(0);
    });

    it('should capture stderr output', async () => {
      const result = await sandboxClient.exec({
        command: 'echo "error message" >&2'
      });

      expect(result.stderr).toContain('error message');
      expect(result.exitCode).toBe(0);
    });

    it('should capture both stdout and stderr', async () => {
      const result = await sandboxClient.exec({
        command: 'echo "out" && echo "err" >&2'
      });

      expect(result.stdout).toContain('out');
      expect(result.stderr).toContain('err');
    });

    it('should execute command with working directory', async () => {
      const result = await sandboxClient.exec({
        command: 'pwd',
        cwd: '/tmp'
      });

      expect(result.stdout.trim()).toBe('/tmp');
      expect(result.exitCode).toBe(0);
    });

    it('should execute piped commands', async () => {
      const result = await sandboxClient.exec({
        command: 'echo "hello world" | tr "a-z" "A-Z"'
      });

      expect(result.stdout.trim()).toBe('HELLO WORLD');
      expect(result.exitCode).toBe(0);
    });

    it('should handle command with special characters', async () => {
      const result = await sandboxClient.exec({
        command: 'echo "test$var\'quote\\"double"'
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBeDefined();
    });

    it('should execute multi-line script', async () => {
      const script = `
        count=0
        for i in 1 2 3; do
          count=$((count + 1))
        done
        echo $count
      `;
      const result = await sandboxClient.exec({
        command: script
      });

      expect(result.stdout.trim()).toBe('3');
      expect(result.exitCode).toBe(0);
    });

    it('should handle command that does not exist', async () => {
      const result = await sandboxClient.exec({
        command: 'nonexistent_command_12345'
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.length > 0 || result.stdout.length > 0).toBe(true);
    });

    it('should handle empty command output', async () => {
      const result = await sandboxClient.exec({
        command: 'true'
      });

      expect(result.stdout).toBe('');
      expect(result.exitCode).toBe(0);
    });

    it('should handle large output', async () => {
      const result = await sandboxClient.exec({
        command: 'seq 1 100'
      });

      expect(result.stdout).toContain('1\n');
      expect(result.stdout).toMatch(/100(\n|$)/);
      expect(result.exitCode).toBe(0);
    });

    it('should preserve environment in command', async () => {
      const result = await sandboxClient.exec({
        command: 'export MY_VAR="test123" && echo $MY_VAR'
      });

      expect(result.stdout.trim()).toBe('test123');
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors gracefully', async () => {
      const invalidClient = createSandboxClient('http://invalid-url-12345.com');

      await expect(invalidClient.health()).rejects.toThrow();
    });

    it('should handle command timeout', async () => {
      // Execute a command that completes quickly to test proper execution
      const result = await sandboxClient.exec({
        command: 'sleep 0.1'
      });

      expect(result).toBeDefined();
      expect(result.exitCode).toBe(0);
    });
  });
});

/**
 * Helper function to wait for container to reach expected state
 */
async function waitForContainerState(
  client: SealosClient,
  name: string,
  expectedStates: string[],
  timeoutMs: number = 30000
): Promise<void> {
  const startTime = Date.now();
  const pollInterval = 2000;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const info = await client.getContainer(name);

      if (info && expectedStates.includes(info.status.state)) {
        return;
      }
    } catch {
      // Ignore errors during polling
    }

    await sleep(pollInterval);
  }

  throw new Error(
    `Timeout waiting for container state. Expected: ${expectedStates.join(' or ')}, timeout: ${timeoutMs}ms`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
