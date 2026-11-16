import { describe, expect, it, vi } from 'vitest';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import { Types } from '@fastgpt/service/common/mongo';
import {
  decryptDomainSecrets,
  encryptDomainSecrets
} from '@fastgpt/service/common/system/systemInstanceConfig/secrets';
import {
  encryptStoredConfigSecrets,
  verifyStoredConfigSecrets
} from '@/migration/tasks/4180/20261116_migrate_system_configs/secrets';

const collection = MongoSystemInstanceConfig.collection;
const assertActive = async () => {};

describe('encryptStoredConfigSecrets', () => {
  it('encrypts old secrets across domains, preserves existing ciphertext and is idempotent', async () => {
    const alreadyEncrypted = encryptDomainSecrets({
      domain: 'auth',
      data: {
        loginProviders: { github: { secret: 'existing-secret' } }
      }
    });
    await collection.insertMany([
      {
        domain: 'auth',
        revision: 3,
        overrides: {
          loginProviders: {
            ...alreadyEncrypted.loginProviders,
            email: { pass: 'legacy-password' },
            google: { secret: '' }
          }
        },
        explicitDefaultPaths: ['loginProviders.microsoft.secret']
      },
      {
        domain: 'site',
        revision: 1,
        overrides: { name: 'Site', customDomain: { kc: { aliyun: 'legacy-key' } } }
      },
      {
        domain: 'providers',
        revision: 1,
        overrides: { documentParse: { customPdf: { key: 'legacy-pdf-key' } } }
      },
      { domain: 'proEnv', revision: 1, overrides: { unregistered: 'not-a-domain-secret' } }
    ]);

    await expect(verifyStoredConfigSecrets()).rejects.toThrow('secret migration incomplete');
    await encryptStoredConfigSecrets({ assertActive });
    await verifyStoredConfigSecrets();
    const after = await collection.find({}).sort({ domain: 1 }).toArray();
    const auth = after.find((item) => item.domain === 'auth')!;
    expect(auth.revision).toBe(4);
    expect(auth.explicitDefaultPaths).toEqual(['loginProviders.microsoft.secret']);
    expect(auth.overrides.loginProviders.github).toEqual(alreadyEncrypted.loginProviders.github);
    expect(auth.overrides.loginProviders.email.pass).toEqual({ secret: expect.any(String) });
    expect(auth.overrides.loginProviders.google.secret).toBe('');
    expect(decryptDomainSecrets('auth', auth.overrides).loginProviders.email.pass).toBe(
      'legacy-password'
    );
    for (const domain of ['site', 'providers'] as const) {
      const doc = after.find((item) => item.domain === domain)!;
      expect(JSON.stringify(doc.overrides)).not.toContain('legacy-');
      expect(doc.revision).toBe(2);
    }
    expect(after.find((item) => item.domain === 'proEnv')?.revision).toBe(1);

    await encryptStoredConfigSecrets({ assertActive });
    expect(await collection.find({}).sort({ domain: 1 }).toArray()).toEqual(after);
  });

  it('retries a concurrent write and encrypts the latest administrator value', async () => {
    await collection.insertOne({
      domain: 'auth',
      revision: 1,
      overrides: { loginProviders: { github: { secret: 'old-value' } } }
    });
    const onWrite = vi.fn().mockImplementationOnce(async () => {
      await collection.updateOne(
        { domain: 'auth' },
        { $set: { 'overrides.loginProviders.github.secret': 'new-value' }, $inc: { revision: 1 } }
      );
    });

    await encryptStoredConfigSecrets({ assertActive: onWrite });
    const doc = await collection.findOne({ domain: 'auth' });
    expect(onWrite).toHaveBeenCalledTimes(2);
    expect(doc?.revision).toBe(3);
    expect(doc?.overrides.loginProviders.github.secret).toEqual({ secret: expect.any(String) });
    expect(decryptDomainSecrets('auth', doc?.overrides).loginProviders.github.secret).toBe(
      'new-value'
    );
  });

  it('does not write after a lost lease and rejects corrupt ciphertext without disclosing values', async () => {
    await collection.insertOne({
      domain: 'auth',
      revision: 1,
      overrides: { loginProviders: { github: { secret: 'private-value' } } }
    });
    const before = await collection.findOne({ domain: 'auth' });
    await expect(
      encryptStoredConfigSecrets({
        assertActive: async () => {
          throw new Error('lease lost');
        }
      })
    ).rejects.toThrow('lease lost');
    expect(await collection.findOne({ domain: 'auth' })).toEqual(before);

    await collection.updateOne(
      { domain: 'auth' },
      { $set: { 'overrides.loginProviders.github.secret': { secret: 'private-value' } } }
    );
    const error = await verifyStoredConfigSecrets().catch((error: Error) => error);
    expect(error.message).toContain('auth.loginProviders.github.secret');
    expect(error.message).not.toContain('private-value');
  });

  it('preserves historical BSON and date metadata outside registry secret paths', async () => {
    const metadata = {
      date: new Date('2026-01-01T00:00:00Z'),
      id: new Types.ObjectId()
    };
    await collection.insertOne({
      domain: 'commercial',
      revision: 1,
      overrides: {
        payment: { alipay: { appPrivateKey: 'legacy-private-key' } },
        subPlans: { legacyMetadata: metadata }
      }
    });
    const before = await collection.findOne({ domain: 'commercial' });

    await encryptStoredConfigSecrets({ assertActive });
    const after = await collection.findOne({ domain: 'commercial' });
    expect(after?.overrides.subPlans.legacyMetadata).toEqual(
      before?.overrides.subPlans.legacyMetadata
    );
    expect(after?.overrides.payment.alipay.appPrivateKey).toEqual({ secret: expect.any(String) });
    await verifyStoredConfigSecrets();
  });
});
