import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { buildSparseLegacyOverrides } from '@/migration/tasks/4180/20261116_migrate_system_configs/service';
import {
  restoreCustomDomainConfig,
  verifyCustomDomainConfig
} from '@/migration/tasks/4180/20261116_migrate_system_configs/backfill';

const legacy = {
  kc: {
    aliyun: 'synthetic-aliyun',
    tencent: 'synthetic-tencent',
    volcengine: 'synthetic-volcengine'
  },
  issuerServiceName: { aliyun: 'issuer-a', tencent: 'issuer-t', volcengine: 'issuer-v' },
  nginxServiceName: { aliyun: 'nginx-a', tencent: 'nginx-t', volcengine: 'nginx-v' }
};
const assertActive = vi.fn(async () => {});

describe('restoreCustomDomainConfig', () => {
  beforeEach(async () => {
    assertActive.mockClear();
    await MongoSystemInstanceConfig.create({ domain: 'site', overrides: {}, revision: 1 });
    await MongoSystemConfigs.create({
      type: SystemConfigsTypeEnum.fastgpt,
      value: { systemEnv: { customDomain: legacy } }
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('restores all nine historical form fields and reruns without rewriting', async () => {
    expect(
      buildSparseLegacyOverrides({ feConfigs: {}, systemEnv: { customDomain: legacy } }).site
        ?.customDomain
    ).toEqual(legacy);
    await expect(restoreCustomDomainConfig({ assertActive })).resolves.toEqual({
      updatedFields: 9
    });
    await expect(verifyCustomDomainConfig()).resolves.toBeUndefined();
    const doc = await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean();
    expect(doc?.overrides.customDomain).toEqual(legacy);
    await expect(restoreCustomDomainConfig({ assertActive })).resolves.toEqual({
      updatedFields: 0
    });
    expect((await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean())?.revision).toBe(
      doc?.revision
    );
  });

  it('preserves administrator values and explicit clearing', async () => {
    await MongoSystemInstanceConfig.updateOne(
      { domain: 'site' },
      {
        $set: {
          overrides: { customDomain: { issuerServiceName: { aliyun: 'admin-issuer' } } },
          explicitDefaultPaths: ['customDomain.kc.aliyun']
        }
      }
    );
    await restoreCustomDomainConfig({ assertActive });
    const doc = await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean();
    expect(doc?.overrides.customDomain.issuerServiceName.aliyun).toBe('admin-issuer');
    expect(doc?.overrides.customDomain.kc?.aliyun).toBeUndefined();
    expect(doc?.explicitDefaultPaths).toContain('customDomain.kc.aliyun');
    await expect(verifyCustomDomainConfig()).resolves.toBeUndefined();
  });

  it('records empty defaults when the old fields were never configured', async () => {
    await MongoSystemConfigs.deleteMany({ type: SystemConfigsTypeEnum.fastgpt });
    await restoreCustomDomainConfig({ assertActive });
    const doc = await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean();
    expect(doc?.overrides).toEqual({});
    expect(doc?.explicitDefaultPaths).toHaveLength(9);
    await expect(verifyCustomDomainConfig()).resolves.toBeUndefined();
  });

  it('retries a revision conflict and retains a concurrent administrator update', async () => {
    const update = MongoSystemInstanceConfig.collection.updateOne.bind(
      MongoSystemInstanceConfig.collection
    );
    vi.spyOn(MongoSystemInstanceConfig.collection, 'updateOne').mockImplementationOnce(async () => {
      await update(
        { domain: 'site' },
        {
          $set: { 'overrides.customDomain.nginxServiceName.aliyun': 'admin-nginx' },
          $inc: { revision: 1 }
        }
      );
      return { modifiedCount: 0 } as Awaited<ReturnType<typeof update>>;
    });
    await restoreCustomDomainConfig({ assertActive });
    const doc = await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean();
    expect(doc?.overrides.customDomain.nginxServiceName.aliyun).toBe('admin-nginx');
    await expect(verifyCustomDomainConfig()).resolves.toBeUndefined();
  });

  it('rejects malformed legacy values without printing their contents or writing partial state', async () => {
    await MongoSystemConfigs.updateMany(
      { type: SystemConfigsTypeEnum.fastgpt },
      {
        $set: {
          'value.systemEnv.customDomain.kc.aliyun': { secret: 'synthetic-private-value' }
        }
      }
    );
    const error = await restoreCustomDomainConfig({ assertActive }).catch((error) => error);
    expect(error.message).toContain('Invalid legacy custom domain field');
    expect(error.message).not.toContain('synthetic-private-value');
    expect((await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean())?.overrides).toEqual(
      {}
    );
  });

  it.each(['missing', 'metadata', 'configuration'] as const)(
    'refuses invalid persisted state: %s',
    async (invalid) => {
      if (invalid === 'missing') {
        await MongoSystemInstanceConfig.deleteMany({ domain: 'site' });
      } else {
        await MongoSystemInstanceConfig.collection.updateOne(
          { domain: 'site' },
          {
            $set:
              invalid === 'metadata'
                ? { explicitDefaultPaths: 'invalid' }
                : { overrides: { customDomain: { kc: { aliyun: 123 } } } }
          }
        );
      }
      await expect(restoreCustomDomainConfig({ assertActive })).rejects.toThrow();
      await expect(verifyCustomDomainConfig()).rejects.toThrow();
    }
  );

  it('does not write after losing the migration lease', async () => {
    await expect(
      restoreCustomDomainConfig({
        assertActive: async () => {
          throw new Error('Synthetic lease loss');
        }
      })
    ).rejects.toThrow('Synthetic lease loss');
    const doc = await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean();
    expect(doc?.revision).toBe(1);
    expect(doc?.overrides).toEqual({});
  });

  it('fails after persistent conflicts without writing partial configuration', async () => {
    vi.spyOn(MongoSystemInstanceConfig.collection, 'updateOne').mockResolvedValue({
      modifiedCount: 0
    } as Awaited<ReturnType<typeof MongoSystemInstanceConfig.collection.updateOne>>);
    await expect(restoreCustomDomainConfig({ assertActive })).rejects.toThrow(
      'repeatedly conflicted'
    );
    expect((await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean())?.overrides).toEqual(
      {}
    );
  });
});
