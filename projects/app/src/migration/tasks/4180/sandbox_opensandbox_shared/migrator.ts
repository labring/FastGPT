import { withSandboxLease } from '@fastgpt/service/core/ai/sandbox/application/lease';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import {
  isLegacyOpenSandboxVolumeLayout,
  isSandboxRecordMigrated,
  LEGACY_DEVBOX_PROVIDER,
  needsLegacyZipTranscode
} from '@fastgpt/service/core/ai/sandbox/legacy';
import { migrateSealosDevboxWithinLease } from './devboxMigrator';
import { migrateLegacyOpenSandboxVolumeWithinLease } from './openSandboxVolumeMigrator';
import type { SealosMigrationClient } from './sealosClient';
import {
  isDevboxArchiveAuthoritative,
  isSandboxSourceActive,
  type SandboxMigrationDoc
} from './utils';
import { transcodeLegacyZipArchiveWithinLease } from './zipTranscoder';

/**
 * 4.18.0 单实例统一迁移入口：在一个 `withSandboxLease` 临界区内完成重读、迁移资格/存活性校验与路线分派。
 */
export async function migrateSandboxDoc(params: {
  docId: SandboxMigrationDoc['_id'];
  sandboxId: string;
  sealosClient?: SealosMigrationClient;
  workDirectory: string;
  activeSourceCache?: Map<string, boolean>;
  signal?: AbortSignal;
}): Promise<'migrated' | 'skipped'> {
  const { docId, sandboxId, sealosClient, workDirectory, activeSourceCache, signal } = params;

  return await withSandboxLease({
    sandboxId,
    label: `migrate-sandbox:${sandboxId}`,
    signal,
    fn: async (lease) => {
      const effectiveSignal = signal ? AbortSignal.any([signal, lease.signal]) : lease.signal;
      effectiveSignal.throwIfAborted();
      lease.assertValid();

      const current = await MongoSandboxInstance.collection.findOne<SandboxMigrationDoc>({
        _id: docId
      });
      if (
        !current ||
        isSandboxRecordMigrated(current) ||
        !(await isSandboxSourceActive(current, activeSourceCache))
      ) {
        return 'skipped';
      }

      if (current.provider === LEGACY_DEVBOX_PROVIDER) {
        if (isDevboxArchiveAuthoritative(current)) {
          return await transcodeLegacyZipArchiveWithinLease({
            current,
            signal: effectiveSignal,
            lease
          });
        }

        return await migrateSealosDevboxWithinLease({
          current,
          sealosClient,
          workDirectory,
          signal: effectiveSignal,
          lease
        });
      }

      if (needsLegacyZipTranscode(current)) {
        return await transcodeLegacyZipArchiveWithinLease({
          current,
          signal: effectiveSignal,
          lease
        });
      }

      if (isLegacyOpenSandboxVolumeLayout(current)) {
        return await migrateLegacyOpenSandboxVolumeWithinLease({
          current,
          signal: effectiveSignal,
          lease
        });
      }

      return 'skipped';
    }
  });
}
