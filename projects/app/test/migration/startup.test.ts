import { describe, expect, it, vi } from 'vitest';
import { startBusinessAfterSystemMigrations } from '@/migration/startup';

describe('startBusinessAfterSystemMigrations', () => {
  it.each([true, false])(
    'waits for every node to reload before starting consumers (blocking: %s)',
    async (blocking) => {
      const events: string[] = [];
      let finishMigration!: () => void;
      const migrationDone = new Promise<void>((resolve) => {
        finishMigration = resolve;
      });
      let finishReload!: () => void;
      const reloadDone = new Promise<void>((resolve) => {
        finishReload = resolve;
      });
      const runner = {
        hasBlockingMigrations: blocking,
        waitForBlockingMigrations: async () => {
          await migrationDone;
          events.push('migrated');
        },
        startBackgroundMigrations: vi.fn(() => {
          events.push('background');
        })
      };
      const reloadModels = vi.fn(async () => {
        events.push('reloading');
        await reloadDone;
        events.push('reloaded');
      });
      const startBusinessServices = vi.fn(async () => {
        events.push('business');
      });
      const initialization = startBusinessAfterSystemMigrations({
        runner,
        reloadModels,
        startBusinessServices
      });
      expect(events).toEqual([]);
      finishMigration();
      if (blocking) {
        await vi.waitFor(() => expect(reloadModels).toHaveBeenCalledTimes(1));
        expect(startBusinessServices).not.toHaveBeenCalled();
        expect(runner.startBackgroundMigrations).not.toHaveBeenCalled();
      }
      finishReload();
      await initialization;
      expect(events).toEqual(
        blocking
          ? ['migrated', 'reloading', 'reloaded', 'business', 'background']
          : ['migrated', 'business', 'background']
      );
      expect(reloadModels).toHaveBeenCalledTimes(blocking ? 1 : 0);
    }
  );

  it.each(['migration', 'reload', 'business'] as const)(
    'keeps later stages closed after a %s failure',
    async (failedStage) => {
      const failure = new Error('initialization failed');
      const runner = {
        hasBlockingMigrations: true,
        waitForBlockingMigrations: vi.fn(async () => {
          if (failedStage === 'migration') throw failure;
        }),
        startBackgroundMigrations: vi.fn()
      };
      const reloadModels = vi.fn(async () => {
        if (failedStage === 'reload') throw failure;
      });
      const startBusinessServices = vi.fn(async () => {
        if (failedStage === 'business') throw failure;
      });
      await expect(
        startBusinessAfterSystemMigrations({ runner, reloadModels, startBusinessServices })
      ).rejects.toBe(failure);
      expect(runner.startBackgroundMigrations).not.toHaveBeenCalled();
      if (failedStage === 'migration') expect(reloadModels).not.toHaveBeenCalled();
      if (failedStage !== 'business') expect(startBusinessServices).not.toHaveBeenCalled();
    }
  );
});
