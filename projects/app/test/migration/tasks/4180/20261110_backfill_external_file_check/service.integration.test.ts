import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import {
  backfillExternalFileCheck,
  verifyExternalFileCheck
} from '@/migration/tasks/4180/20261110_backfill_external_file_check/service';
import {
  applyInstanceConfigMigration,
  buildLegacyDomainOverrides,
  sanitizeOverridesForSchema
} from '@/migration/tasks/4180/20260928_migrate_instance_configs/service';
import { resolveDomainEffectiveConfig } from '@fastgpt/global/common/system/config/schema';
import { readLegacyInstanceConfigEnv } from '@/migration/tasks/4180/20260928_migrate_instance_configs/env';

const collection = MongoSystemInstanceConfig.collection;
const run = () => backfillExternalFileCheck({ assertActive: async () => {} });

describe('external file check backfill with MongoDB', () => {
  beforeEach(async () => {
    await MongoSystemInstanceConfig.deleteMany({});
  });

  it.each([200, 201, 1000])(
    'preserves all %i valid legacy hosts and keeps external file checking enabled',
    async (count) => {
      const hosts = Array.from({ length: count }, (_, index) => `host-${index}.example.test`);
      const warnings: string[] = [];
      const raw = buildLegacyDomainOverrides({
        feConfigs: {},
        systemEnv: { fileUrlWhitelist: hosts },
        legacyEnv: readLegacyInstanceConfigEnv()
      });
      const overrides = sanitizeOverridesForSchema({ overrides: raw, warnings });
      await applyInstanceConfigMigration({
        overrides,
        logger: { info: () => {}, warn: () => {}, error: () => {} }
      });

      expect(await run()).toEqual({ updatedDocuments: 1 });
      await expect(verifyExternalFileCheck()).resolves.toBeUndefined();
      const document = await MongoSystemInstanceConfig.findOne({ domain: 'security' }).lean();
      const effective = resolveDomainEffectiveConfig({
        domain: 'security',
        overrides: document?.overrides
      });
      expect(effective.fileUrlWhitelist).toEqual(hosts);
      expect(effective.checkExternalFile).toBe(true);
      expect(warnings).toEqual([]);
      expect(await run()).toEqual({ updatedDocuments: 0 });
    }
  );

  it.each(['missing', 'null'] as const)(
    'treats %s overrides as empty and safely reruns',
    async (kind) => {
      await collection.insertOne({
        _id: 'security',
        revision: 2,
        ...(kind === 'null' ? { overrides: null } : {})
      } as any);

      expect(await run()).toEqual({ updatedDocuments: 1 });
      await expect(verifyExternalFileCheck()).resolves.toBeUndefined();
      expect(await collection.findOne({ _id: 'security' } as any)).toMatchObject({
        _id: 'security',
        revision: 3,
        overrides: { checkExternalFile: false }
      });
      expect(await run()).toEqual({ updatedDocuments: 0 });
    }
  );

  it('keeps an explicitly pruned false despite a nonempty legacy allowlist', async () => {
    await collection.insertOne({
      _id: 'security',
      revision: 2,
      overrides: { fileUrlWhitelist: ['cdn.example.com'] },
      explicitDefaultPaths: ['checkExternalFile']
    } as any);

    expect(await run()).toEqual({ updatedDocuments: 0 });
    await expect(verifyExternalFileCheck()).resolves.toBeUndefined();
    expect(await collection.findOne({ _id: 'security' } as any)).toMatchObject({
      revision: 2,
      overrides: { fileUrlWhitelist: ['cdn.example.com'] },
      explicitDefaultPaths: ['checkExternalFile']
    });
  });

  it('honors a concurrent explicit false rather than overwriting it with the old allowlist', async () => {
    await collection.insertOne({
      _id: 'security',
      revision: 2,
      overrides: { fileUrlWhitelist: ['cdn.example.com'] }
    } as any);
    const update = collection.updateOne.bind(collection);
    const spy = vi.spyOn(collection, 'updateOne').mockImplementationOnce((async (
      filter: any,
      value: any,
      options: any
    ) => {
      await update({ _id: 'security' } as any, {
        $set: { 'overrides.checkExternalFile': false },
        $inc: { revision: 1 }
      });
      return update(filter, value, options);
    }) as any);

    try {
      expect(await run()).toEqual({ updatedDocuments: 0 });
      expect(spy).toHaveBeenCalledOnce();
      await expect(verifyExternalFileCheck()).resolves.toBeUndefined();
      expect(await collection.findOne({ _id: 'security' } as any)).toMatchObject({
        revision: 3,
        overrides: { fileUrlWhitelist: ['cdn.example.com'], checkExternalFile: false }
      });
    } finally {
      spy.mockRestore();
    }
  });
});
