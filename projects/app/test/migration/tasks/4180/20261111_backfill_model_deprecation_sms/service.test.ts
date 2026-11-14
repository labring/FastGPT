import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import { buildLegacyProOverrides } from '@/migration/tasks/4180/20260928_migrate_instance_configs/service';
import {
  backfillModelDeprecationSms,
  verifyModelDeprecationSms
} from '@/migration/tasks/4180/20261111_backfill_model_deprecation_sms/service';

const collection = MongoSystemInstanceConfig.collection;
const assertActive = vi.fn().mockResolvedValue(undefined);
const run = () => backfillModelDeprecationSms({ assertActive });
const read = () => collection.findOne({ domain: 'auth' });
const seedLegacy = (sms: Record<string, unknown>) =>
  MongoSystemConfigs.create({ type: 'fastgptPro', value: { auth: { sms } } });

beforeEach(async () => {
  assertActive.mockReset().mockResolvedValue(undefined);
  await collection.insertOne({
    domain: 'auth',
    revision: 4,
    overrides: { loginProviders: { sms: { login: { zh: 'LOGIN_ID' } } } },
    explicitDefaultPaths: []
  });
});

describe('backfillModelDeprecationSms', () => {
  it('maps the legacy Chinese template in the original migration and backfills once', async () => {
    const sms = { MODEL_DEPRECATION: 'ZH_ID', MODEL_DEPRECATION_EN: 'EN_ID' };
    expect(buildLegacyProOverrides({ auth: { sms } }).auth).toMatchObject({
      loginProviders: { sms: { modelDeprecation: { zh: 'ZH_ID' } } }
    });
    await seedLegacy(sms);
    expect(await run()).toEqual({ updatedDocuments: 1 });
    expect(await read()).toMatchObject({
      revision: 5,
      overrides: {
        loginProviders: { sms: { login: { zh: 'LOGIN_ID' }, modelDeprecation: { zh: 'ZH_ID' } } }
      }
    });
    await verifyModelDeprecationSms();
    expect(await run()).toEqual({ updatedDocuments: 0 });
    expect((await read())?.revision).toBe(5);
  });

  it('falls back to the historical English template only when Chinese is absent', async () => {
    await seedLegacy({ MODEL_DEPRECATION: '', MODEL_DEPRECATION_EN: 'EN_ID' });
    await run();
    expect((await read())?.overrides.loginProviders.sms.modelDeprecation.zh).toBe('EN_ID');
  });

  it.each(['admin value', 'explicit clear'] as const)(
    'preserves an existing %s and does not write',
    async (setting) => {
      await seedLegacy({ MODEL_DEPRECATION: 'LEGACY_ID' });
      await collection.updateOne(
        { domain: 'auth' },
        setting === 'admin value'
          ? { $set: { 'overrides.loginProviders.sms.modelDeprecation.zh': 'ADMIN_ID' } }
          : { $set: { explicitDefaultPaths: ['loginProviders.sms.modelDeprecation.zh'] } }
      );
      const before = await read();
      expect(await run()).toEqual({ updatedDocuments: 0 });
      expect(await read()).toEqual(before);
      await verifyModelDeprecationSms();
    }
  );

  it('does not create a template when there is no legacy value', async () => {
    const before = await read();
    expect(await run()).toEqual({ updatedDocuments: 0 });
    expect(await read()).toEqual(before);
    await verifyModelDeprecationSms();
  });

  it('retries a concurrent administrator save without overwriting it', async () => {
    await seedLegacy({ MODEL_DEPRECATION: 'LEGACY_ID' });
    assertActive.mockImplementationOnce(async () => {
      await collection.updateOne(
        { domain: 'auth' },
        {
          $set: { 'overrides.loginProviders.sms.modelDeprecation.zh': 'ADMIN_ID' },
          $inc: { revision: 1 }
        }
      );
    });
    expect(await run()).toEqual({ updatedDocuments: 0 });
    expect((await read())?.overrides.loginProviders.sms.modelDeprecation.zh).toBe('ADMIN_ID');
    await verifyModelDeprecationSms();
  });

  it('does not write invalid legacy data or write after losing the lease', async () => {
    await seedLegacy({ MODEL_DEPRECATION: 'x'.repeat(2001) });
    const before = await read();
    const error = await run().catch((err: Error) => err);
    expect(String(error)).toBe('Error: Invalid legacy model deprecation SMS template');
    expect(await read()).toEqual(before);
    await MongoSystemConfigs.deleteMany({ type: 'fastgptPro' });
    await seedLegacy({ MODEL_DEPRECATION: 'LEGACY_ID' });
    assertActive.mockRejectedValueOnce(new Error('lease lost'));
    await expect(run()).rejects.toThrow('lease lost');
    expect(await read()).toEqual(before);
  });
});
