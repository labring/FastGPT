/**
 * Skill Sandbox Cleanup
 *
 * Provides cleanup logic for inactive sandboxes and cron job scheduling.
 */

import cron from 'node-cron';
import { findInactiveSandboxes } from './sandboxController';
import { MongoSkillSandbox } from './sandboxSchema';
import { getSandboxDefaults, getSandboxProviderConfig } from './sandboxConfig';
import { getLogger, LogCategories } from '../../common/logger';
import { createSandbox } from '@anyany/sandbox_provider';
import type { ISandbox } from '@anyany/sandbox_provider';

const addLog = getLogger(LogCategories.MODULE.AI.AGENT);

/**
 * Cleanup a single inactive sandbox
 */
async function cleanupSandbox(sandbox: any): Promise<void> {
  try {
    addLog.info('[Cleanup] Processing sandbox', {
      sandboxId: sandbox._id,
      skillId: sandbox.skillId,
      lastActivity: sandbox.lastActivityTime
    });

    const providerConfig = getSandboxProviderConfig();
    let sandboxInstance: ISandbox | null = null;

    try {
      // Try to delete from provider
      sandboxInstance = createSandbox({
        provider: 'opensandbox',
        connection: {
          apiKey: providerConfig.apiKey,
          baseUrl: providerConfig.baseUrl,
          runtime: providerConfig.runtime
        }
      });

      await sandboxInstance.connect({ id: sandbox.sandbox.sandboxId });
      await sandboxInstance.delete();

      addLog.info('[Cleanup] Successfully deleted provider sandbox', {
        providerSandboxId: sandbox.sandbox.sandboxId
      });
    } catch (providerError) {
      // Provider deletion may fail if sandbox already deleted
      addLog.warn('[Cleanup] Failed to delete provider sandbox', {
        providerSandboxId: sandbox.sandbox.sandboxId,
        error: providerError
      });
    } finally {
      if (sandboxInstance) {
        await sandboxInstance.close();
      }
    }

    // Soft delete in MongoDB
    await MongoSkillSandbox.updateOne({ _id: sandbox._id }, { $set: { deleteTime: new Date() } });

    addLog.info('[Cleanup] Sandbox marked as deleted', {
      sandboxId: sandbox._id
    });
  } catch (error) {
    addLog.error('[Cleanup] Failed to cleanup sandbox', {
      sandboxId: sandbox._id,
      error
    });
    throw error;
  }
}

/**
 * Run cleanup for all inactive sandboxes
 */
export async function cleanupInactiveSandboxes(): Promise<{
  total: number;
  succeeded: number;
  failed: number;
}> {
  const startTime = Date.now();

  addLog.info('[Cleanup] Starting sandbox cleanup');

  try {
    // Find inactive sandboxes
    const inactiveSandboxes = await findInactiveSandboxes();

    if (inactiveSandboxes.length === 0) {
      addLog.info('[Cleanup] No inactive sandboxes found');
      return { total: 0, succeeded: 0, failed: 0 };
    }

    addLog.info('[Cleanup] Found inactive sandboxes', {
      count: inactiveSandboxes.length
    });

    // Process each sandbox
    let succeeded = 0;
    let failed = 0;

    for (const sandbox of inactiveSandboxes) {
      try {
        await cleanupSandbox(sandbox);
        succeeded++;
      } catch (error) {
        failed++;
        addLog.error('[Cleanup] Error processing sandbox', {
          sandboxId: sandbox._id,
          error
        });
      }
    }

    const duration = Date.now() - startTime;

    addLog.info('[Cleanup] Cleanup completed', {
      total: inactiveSandboxes.length,
      succeeded,
      failed,
      duration: `${duration}ms`
    });

    return {
      total: inactiveSandboxes.length,
      succeeded,
      failed
    };
  } catch (error) {
    addLog.error('[Cleanup] Cleanup process failed', { error });
    throw error;
  }
}

/**
 * Cleanup expired sandboxes (based on expiresAt field)
 */
export async function cleanupExpiredSandboxes(): Promise<{
  total: number;
  succeeded: number;
  failed: number;
}> {
  addLog.info('[Cleanup] Starting expired sandbox cleanup');

  try {
    // Find expired sandboxes
    const expiredSandboxes = await MongoSkillSandbox.find({
      deleteTime: null,
      'sandbox.expiresAt': { $lt: new Date() }
    });

    if (expiredSandboxes.length === 0) {
      addLog.info('[Cleanup] No expired sandboxes found');
      return { total: 0, succeeded: 0, failed: 0 };
    }

    addLog.info('[Cleanup] Found expired sandboxes', {
      count: expiredSandboxes.length
    });

    let succeeded = 0;
    let failed = 0;

    for (const sandbox of expiredSandboxes) {
      try {
        await cleanupSandbox(sandbox);
        succeeded++;
      } catch (error) {
        failed++;
      }
    }

    return {
      total: expiredSandboxes.length,
      succeeded,
      failed
    };
  } catch (error) {
    addLog.error('[Cleanup] Expired sandbox cleanup failed', { error });
    throw error;
  }
}

/**
 * Schedule cleanup cron job
 */
export function scheduleSandboxCleanup(): void {
  const defaults = getSandboxDefaults();
  const intervalMs = defaults.cleanupInterval;

  // Convert milliseconds to minutes for cron
  const intervalMinutes = Math.max(1, Math.floor(intervalMs / 60000));

  // Schedule cleanup every N minutes
  const cronExpression = `*/${intervalMinutes} * * * *`;

  addLog.info('[Cleanup] Scheduling cleanup job', {
    interval: `${intervalMinutes} minutes`,
    cronExpression
  });

  cron.schedule(cronExpression, async () => {
    try {
      addLog.info('[Cleanup] Running scheduled cleanup');

      // Run both inactive and expired cleanup
      const [inactiveResult, expiredResult] = await Promise.all([
        cleanupInactiveSandboxes(),
        cleanupExpiredSandboxes()
      ]);

      addLog.info('[Cleanup] Scheduled cleanup completed', {
        inactive: inactiveResult,
        expired: expiredResult
      });
    } catch (error) {
      addLog.error('[Cleanup] Scheduled cleanup error', { error });
    }
  });

  addLog.info('[Cleanup] Cleanup job scheduled successfully');
}

/**
 * Run cleanup once immediately (for manual triggers)
 */
export async function runCleanupNow(): Promise<{
  inactive: { total: number; succeeded: number; failed: number };
  expired: { total: number; succeeded: number; failed: number };
}> {
  addLog.info('[Cleanup] Manual cleanup triggered');

  const [inactiveResult, expiredResult] = await Promise.all([
    cleanupInactiveSandboxes(),
    cleanupExpiredSandboxes()
  ]);

  return {
    inactive: inactiveResult,
    expired: expiredResult
  };
}
