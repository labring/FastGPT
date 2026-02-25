import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createSealosClient } from '../../src/clients';
import type { SealosClient } from '../../src/clients';
import { env, containerConfig } from '../../src/env';

/**
 * Integration tests for Container lifecycle management.
 *
 * Tests run only when SEALOS_KC is provided in .env.test.local
 *
 * Required environment variables:
 * - SEALOS_BASE_URL: Sealos API base URL
 * - SEALOS_KC: Sealos kubeconfig token
 * - CONTAINER_IMAGE: Docker image for container
 * - CONTAINER_CPU: CPU resource
 * - CONTAINER_MEMORY: Memory resource
 */

const sealosKc = env.SEALOS_KC;

describe.skipIf(!sealosKc)('Container Integration Tests', () => {
  // Generate unique container name for test isolation
  const testContainerName = `test-container-${Math.random().toString(36).substring(2, 8)}`;

  let sealosClient: SealosClient;

  beforeAll(() => {
    sealosClient = createSealosClient();
  });

  afterAll(async () => {
    // Cleanup: ensure container is deleted after tests
    try {
      await sealosClient.deleteContainer(testContainerName);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Container Lifecycle', () => {
    it('should return null when getting non-existent container', async () => {
      const info = await sealosClient.getContainer(testContainerName);
      expect(info).toBeNull();
    });

    it('should create a new container', async () => {
      await sealosClient.createContainer({ name: testContainerName });

      // Verify container was created by getting its info
      const info = await sealosClient.getContainer(testContainerName);
      expect(info).not.toBeNull();
      expect(info!.name).toBe(testContainerName);
      // Image should match the configured image from environment
      expect(info!.image.imageName).toContain(containerConfig.image.split(':')[0]);
    });

    it('should get container information', async () => {
      const info = await sealosClient.getContainer(testContainerName);

      expect(info).not.toBeNull();
      expect(info!.name).toBe(testContainerName);
      expect(info!.image).toBeDefined();
      expect(info!.status).toBeDefined();
      expect(['Creating', 'Running', 'Paused', 'Error', 'Unknown']).toContain(info!.status.state);
    });

    it('should wait for container to be running', async () => {
      // Wait for container to be ready
      await waitForContainerState(sealosClient, testContainerName, ['Running'], 20000);

      const info = await sealosClient.getContainer(testContainerName);
      expect(info!.status.state).toBe('Running');
    }, 30000);

    it('should pause a running container', async () => {
      await sealosClient.pauseContainer(testContainerName);

      // Wait and verify paused state
      await waitForContainerState(sealosClient, testContainerName, ['Paused'], 30000);

      const info = await sealosClient.getContainer(testContainerName);
      expect(info!.status.state).toBe('Paused');
    }, 60000);

    it('should start/resume a paused container', async () => {
      await sealosClient.resumeContainer(testContainerName);

      // Wait and verify running state
      await waitForContainerState(sealosClient, testContainerName, ['Running'], 20000);

      const info = await sealosClient.getContainer(testContainerName);
      expect(info!.status.state).toBe('Running');
    }, 30000);

    it('should delete the container', async () => {
      await sealosClient.deleteContainer(testContainerName);

      // Verify container no longer exists
      await sleep(2000); // Give it time to delete
      const info = await sealosClient.getContainer(testContainerName);
      expect(info).toBeNull();
    });
  });

  describe('Idempotent Operations', () => {
    const idempotentTestName = `idempotent-${Math.random().toString(36).substring(2, 8)}`;

    afterAll(async () => {
      try {
        await sealosClient.deleteContainer(idempotentTestName);
      } catch {
        // Ignore
      }
    });

    it('should handle creating an already existing container', async () => {
      // Create container
      await sealosClient.createContainer({ name: idempotentTestName });

      // Creating again should not throw (Sealos returns existing container)
      await expect(
        sealosClient.createContainer({ name: idempotentTestName })
      ).resolves.not.toThrow();

      // Cleanup
      await sealosClient.deleteContainer(idempotentTestName);
    }, 60000);

    it('should handle deleting a non-existent container', async () => {
      const nonExistentName = `non-existent-${Math.random().toString(36).substring(2, 8)}`;

      // Deleting non-existent container should not throw
      await expect(sealosClient.deleteContainer(nonExistentName)).resolves.not.toThrow();
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
    const info = await client.getContainer(name);

    if (info && expectedStates.includes(info.status.state)) {
      return;
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
