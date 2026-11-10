import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import {
  backfillExternalFileCheck,
  verifyExternalFileCheck
} from '@/migration/tasks/4180/20261110_backfill_external_file_check/service';

const collection = MongoSystemInstanceConfig.collection;
const run = () => backfillExternalFileCheck({ assertActive: async () => {} });

describe('external file check backfill with MongoDB', () => {
  beforeEach(async () => {
    await MongoSystemInstanceConfig.deleteMany({});
  });

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
