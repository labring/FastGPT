import { getS3SandboxSource } from '@fastgpt/service/common/s3/sources/sandbox';
import { withSandboxLease } from '@fastgpt/service/core/ai/sandbox/application/lease';
import { SandboxInstanceStatusEnum } from '@fastgpt/service/core/ai/sandbox/constants';
import { getLegacySandboxInstanceCollection } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import { getSessionVolumeClaimName } from '@fastgpt/service/core/ai/sandbox/infrastructure/volume/service';
import { LEGACY_DEVBOX_PROVIDER } from '@fastgpt/service/core/ai/sandbox/legacy';
import { SANDBOX_PROVIDER } from '@fastgpt/service/core/ai/sandbox/type';
import { migrateSealosDevboxWithinLease } from './devboxMigrator';
import { migrateLegacyOpenSandboxVolumeWithinLease } from './openSandboxVolumeMigrator';
import type { SealosMigrationClient } from './sealosClient';
import {
  hasMigratedV3Record,
  isDevboxArchiveAuthoritative,
  isLegacyOpenSandboxArchiveAuthoritative,
  isSandboxSourceActive,
  migrateProvisioningSandboxFallback,
  SANDBOX_MIGRATION_PROJECTION,
  type SandboxMigrationDoc
} from './utils';
import { buildLegacySandboxZipKey, transcodeLegacyZipArchiveWithinLease } from './zipTranscoder';

/**
 * 4.18.0 单实例统一迁移入口：在一个 `withSandboxLease` 临界区内从 `v2` 只读重读、校验资格/存活性并迁移写入 `v3`。
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

      const current = await getLegacySandboxInstanceCollection().findOne<SandboxMigrationDoc>(
        { _id: docId },
        { projection: SANDBOX_MIGRATION_PROJECTION }
      );
      if (
        !current ||
        current.status === SandboxInstanceStatusEnum.deleting ||
        (await hasMigratedV3Record(current)) ||
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

      if (current.provider === SANDBOX_PROVIDER) {
        if (isLegacyOpenSandboxArchiveAuthoritative(current)) {
          return await transcodeLegacyZipArchiveWithinLease({
            current,
            signal: effectiveSignal,
            lease
          });
        }

        const claimName = getSessionVolumeClaimName(current.storage);
        if (claimName) {
          return await migrateLegacyOpenSandboxVolumeWithinLease({
            current,
            claimName,
            signal: effectiveSignal,
            lease
          });
        }

        if (current.status === SandboxInstanceStatusEnum.provisioning) {
          return await migrateProvisioningSandboxFallback({
            current,
            hasLegacyZip: await getS3SandboxSource().isObjectExists(
              buildLegacySandboxZipKey(current.sandboxId)
            ),
            transcodeLegacyZip: () =>
              transcodeLegacyZipArchiveWithinLease({
                current,
                signal: effectiveSignal,
                lease
              }),
            lease,
            signal: effectiveSignal
          });
        }

        throw new Error(
          `Legacy OpenSandbox record ${current.sandboxId} is missing workspace volume claimName`
        );
      }

      throw new Error(`Unsupported legacy sandbox provider: ${String(current.provider)}`);
    }
  });
}
