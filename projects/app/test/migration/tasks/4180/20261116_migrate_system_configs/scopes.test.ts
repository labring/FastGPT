import { describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import {
  decryptDomainSecrets,
  encryptDomainSecrets
} from '@fastgpt/service/common/system/systemInstanceConfig/secrets';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  migrateLegacyConfigScopes,
  verifyLegacyConfigScopes
} from '@/migration/tasks/4180/20261116_migrate_system_configs/scopes';
import {
  encryptStoredConfigSecrets,
  verifyStoredConfigSecrets
} from '@/migration/tasks/4180/20261116_migrate_system_configs/secrets';

vi.unmock('@fastgpt/service/common/mongo/sessionRun');

const objectId = (value: number) => new Types.ObjectId(value.toString(16).padStart(24, '0'));
const scopeValues = {
  subPlans: {
    extraDatasetSize: { price: '4', legacyPriceMetadata: 'retained' },
    extraPoints: {
      packages: [{ points: '100', month: '1', price: '5', legacyPackageMetadata: 'retained' }]
    },
    legacyPlanMetadata: { keep: true }
  },
  license: {
    license: 'synthetic-signed-license',
    data: { instanceId: 'bound-instance-id', functions: { oldFeature: true }, legacyVersion: 2 },
    legacyLicenseMetadata: { keep: true }
  },
  instanceId: { instanceId: 'bound-instance-id', legacyIdentityMetadata: 'retained' },
  modelStatusProbe: { enabled: true, intervalMinutes: 10, legacyField: 'retained' },
  moderationPolicy: { enabled: true, hooks: { userInput: false }, legacyField: 'retained' },
  systemMsgModal: { id: 'announcement', content: 'hello', legacyField: 'retained' },
  operationalAd: {
    id: 'operational',
    operationalAdImage: 'https://example.test/operational.png',
    operationalAdLink: 'https://example.test/operational',
    legacyField: 'retained'
  },
  activityAd: {
    id: 'activity',
    activityAdImage: 'https://example.test/activity.png',
    activityAdLink: 'https://example.test/activity',
    legacyField: 'retained'
  }
} as const;

const normalizedPlans = {
  ...scopeValues.subPlans,
  extraDatasetSize: { ...scopeValues.subPlans.extraDatasetSize, price: 4 },
  extraPoints: {
    packages: [{ points: 100, month: 1, price: 5, legacyPackageMetadata: 'retained' }]
  }
};

const invalidValues = [
  ['subPlans', { extraDatasetSize: { price: 'private-invalid-value' } }, 'extraDatasetSize.price'],
  ['license', { license: { private: 'private-invalid-value' } }, 'license'],
  ['instanceId', { instanceId: { private: 'private-invalid-value' } }, 'instanceId'],
  ['modelStatusProbe', { intervalMinutes: 'private-invalid-value' }, 'intervalMinutes'],
  [
    'moderationPolicy',
    { hooks: { userInput: { private: 'private-invalid-value' } } },
    'hooks.userInput'
  ],
  ['systemMsgModal', { content: { private: 'private-invalid-value' } }, 'content'],
  [
    'operationalAd',
    { operationalAdImage: { private: 'private-invalid-value' } },
    'operationalAdImage'
  ],
  ['activityAd', { activityAdLink: { private: 'private-invalid-value' } }, 'activityAdLink']
] as const;

const readTargets = () => MongoSystemInstanceConfig.find({}).sort({ domain: 1 }).lean();

describe('migrateLegacyConfigScopes', () => {
  it('encrypts old model probe tokens on import and when rescanning existing scopes', async () => {
    await MongoSystemConfigs.create({
      type: 'modelStatusProbe',
      value: { enabled: true, intervalMinutes: 10, webhookToken: 'old-webhook-token' }
    });

    await migrateLegacyConfigScopes();
    await verifyLegacyConfigScopes();
    const imported = await MongoSystemInstanceConfig.findOne({ domain: 'modelStatusProbe' }).lean();
    expect(imported?.overrides.webhookToken).toEqual({ secret: expect.any(String) });
    expect(decryptDomainSecrets('modelStatusProbe', imported?.overrides)).toMatchObject({
      enabled: true,
      intervalMinutes: 10,
      webhookToken: 'old-webhook-token'
    });
    await migrateLegacyConfigScopes();
    expect(await MongoSystemInstanceConfig.findOne({ domain: 'modelStatusProbe' }).lean()).toEqual(
      imported
    );

    // 旧版本可能已创建目标 scope，补迁扫尾必须原地加密且复跑不改变密文或 revision。
    await MongoSystemInstanceConfig.collection.updateOne(
      { domain: 'modelStatusProbe' },
      { $set: { 'overrides.webhookToken': 'existing-webhook-token' }, $inc: { revision: 1 } }
    );
    await expect(verifyStoredConfigSecrets()).rejects.toThrow('modelStatusProbe');
    await encryptStoredConfigSecrets({ assertActive: async () => {} });
    await verifyStoredConfigSecrets();
    await verifyLegacyConfigScopes();
    const migrated = await MongoSystemInstanceConfig.findOne({ domain: 'modelStatusProbe' }).lean();
    expect(migrated?.overrides.webhookToken).toEqual({ secret: expect.any(String) });
    expect(decryptDomainSecrets('modelStatusProbe', migrated?.overrides).webhookToken).toBe(
      'existing-webhook-token'
    );
    expect(migrated?.revision).toBe((imported?.revision ?? 0) + 2);
    await encryptStoredConfigSecrets({ assertActive: async () => {} });
    expect(await MongoSystemInstanceConfig.findOne({ domain: 'modelStatusProbe' }).lean()).toEqual(
      migrated
    );
  });

  it('retains encrypted payment credentials while merging legacy plans', async () => {
    const stored = encryptDomainSecrets('commercial', {
      payment: { alipay: { appPrivateKey: 'existing-private-key' } }
    });
    await MongoSystemInstanceConfig.create({
      domain: 'commercial',
      overrides: stored,
      revision: 4
    });
    await MongoSystemConfigs.create({ type: 'subPlans', value: scopeValues.subPlans });

    await migrateLegacyConfigScopes();
    await verifyLegacyConfigScopes();
    const commercial = await MongoSystemInstanceConfig.findOne({ domain: 'commercial' }).lean();
    expect(commercial?.overrides.payment.alipay.appPrivateKey).toEqual(
      stored.payment.alipay.appPrivateKey
    );
    expect(decryptDomainSecrets('commercial', commercial?.overrides)).toMatchObject({
      payment: { alipay: { appPrivateKey: 'existing-private-key' } },
      subPlans: normalizedPlans
    });
  });

  it('migrates all eight latest scopes, preserves the bound license and old records, and leaves Pro ENV untouched', async () => {
    const createTime = new Date('2026-04-01T00:00:00.000Z');
    const entries = Object.entries(scopeValues);
    const sortedScopes = new Set([
      'license',
      'modelStatusProbe',
      'moderationPolicy',
      'systemMsgModal',
      'operationalAd',
      'activityAd'
    ]);
    const latest = entries.map(([type, value], index) => ({
      _id: type === 'instanceId' ? objectId(1) : objectId(0x100 + index),
      type,
      value,
      createTime
    }));
    const olderWithSameTime = entries.flatMap(([type, value], index) =>
      sortedScopes.has(type)
        ? [
            {
              _id: objectId(0x10 + index),
              type,
              value: { ...value, legacyField: 'older' },
              createTime
            }
          ]
        : []
    );
    await MongoSystemConfigs.create([
      ...olderWithSameTime,
      ...latest,
      {
        _id: objectId(0x900),
        type: 'license',
        value: { license: 'older-time-license' },
        createTime: new Date('2025-01-01T00:00:00.000Z')
      },
      {
        _id: objectId(0x901),
        type: 'instanceId',
        value: { instanceId: 'newer-but-not-fixed-id' },
        createTime: new Date('2030-01-01T00:00:00.000Z')
      },
      {
        type: 'fastgpt',
        value: {
          subPlans: { extraDatasetSize: { price: 99 } },
          systemEnv: { langfuse: { secretKey: 'ignored-fallback' } }
        }
      },
      { type: 'proEnv', value: { teamMode: 'multi' } }
    ]);
    await MongoSystemInstanceConfig.create({
      domain: 'proEnv',
      overrides: { teamMode: 'single' },
      revision: 8,
      updatedBy: { actor: 'system' }
    });
    const beforeSources = await MongoSystemConfigs.find({}).sort({ _id: 1 }).lean();
    const proBefore = await MongoSystemInstanceConfig.findOne({ domain: 'proEnv' }).lean();

    await migrateLegacyConfigScopes();
    await verifyLegacyConfigScopes();

    const targets = await readTargets();
    expect(targets).toHaveLength(7);
    const expectedTargets = {
      commercial: { subPlans: normalizedPlans },
      operations: {
        systemMsgModal: scopeValues.systemMsgModal,
        operationalAd: scopeValues.operationalAd,
        activityAd: scopeValues.activityAd
      },
      license: scopeValues.license,
      instanceId: scopeValues.instanceId,
      modelStatusProbe: scopeValues.modelStatusProbe,
      moderationPolicy: scopeValues.moderationPolicy
    };
    for (const [domain, expected] of Object.entries(expectedTargets)) {
      const target = targets.find((doc) => doc.domain === domain);
      expect(target).toMatchObject({
        domain,
        overrides: expected,
        revision: 1,
        schemaVersion: 1,
        updatedBy: { actor: 'migration' },
        explicitDefaultPaths: []
      });
      expect(target?.overrides).toEqual(expected);
      expect(target?.createdAt).toBeInstanceOf(Date);
      expect(target?.updatedAt).toBeInstanceOf(Date);
    }
    const license = targets.find((doc) => doc.domain === 'license');
    const instance = targets.find((doc) => doc.domain === 'instanceId');
    expect(license?.overrides.data.instanceId).toBe(instance?.overrides.instanceId);
    expect(await MongoSystemConfigs.find({}).sort({ _id: 1 }).lean()).toEqual(beforeSources);
    expect(await MongoSystemInstanceConfig.findOne({ domain: 'proEnv' }).lean()).toEqual(proBefore);

    await migrateLegacyConfigScopes();
    expect(await readTargets()).toEqual(targets);
  });

  it('prefers an existing valid target over an obsolete invalid source and never rewrites it', async () => {
    await MongoSystemConfigs.create([
      { type: 'license', value: { license: 12345 } },
      { type: 'systemMsgModal', value: scopeValues.systemMsgModal }
    ]);
    await MongoSystemInstanceConfig.create({
      domain: 'license',
      overrides: scopeValues.license,
      revision: 7,
      updatedBy: { actor: 'admin', username: 'test-admin' }
    });
    const original = await MongoSystemInstanceConfig.findOne({ domain: 'license' }).lean();
    await migrateLegacyConfigScopes();
    await verifyLegacyConfigScopes();
    await migrateLegacyConfigScopes();
    expect(await MongoSystemInstanceConfig.findOne({ domain: 'license' }).lean()).toEqual(original);
    expect(
      (await MongoSystemInstanceConfig.findOne({ domain: 'operations' }).lean())?.overrides
        .systemMsgModal
    ).toEqual(scopeValues.systemMsgModal);
  });

  it('uses the highest-id fastgpt snapshot for missing plans, without importing legacy Pro ENV', async () => {
    await MongoSystemConfigs.create([
      {
        _id: objectId(10),
        type: 'fastgpt',
        createTime: new Date('2030-01-01T00:00:00.000Z'),
        value: { subPlans: { extraDatasetSize: { price: 99 } } }
      },
      {
        _id: objectId(11),
        type: 'fastgpt',
        createTime: new Date('2025-01-01T00:00:00.000Z'),
        value: {
          subPlans: scopeValues.subPlans,
          systemEnv: { langfuse: { publicKey: 'legacy-public', secretKey: 'legacy-secret' } }
        }
      },
      { type: 'proEnv', value: { teamMode: 'multi' } }
    ]);
    await migrateLegacyConfigScopes();
    await verifyLegacyConfigScopes();
    expect(
      (await MongoSystemInstanceConfig.findOne({ domain: 'commercial' }).lean())?.overrides.subPlans
    ).toEqual(normalizedPlans);
    expect(await MongoSystemInstanceConfig.findOne({ domain: 'langfuse' }).lean()).toBeNull();
    expect(await MongoSystemInstanceConfig.findOne({ domain: 'proEnv' }).lean()).toBeNull();
  });

  it('merges legacy instance scopes before old records while retaining existing commercial and operations fields', async () => {
    await MongoSystemConfigs.create([
      { type: 'subPlans', value: { extraDatasetSize: { price: 99 } } },
      { type: 'operationalAd', value: { id: 'older-record' } },
      { type: 'activityAd', value: scopeValues.activityAd }
    ]);
    await MongoSystemInstanceConfig.create([
      {
        domain: 'commercial',
        overrides: { payment: { wx: { appId: 'existing-payment' } } },
        revision: 7,
        updatedBy: { actor: 'admin' }
      },
      {
        domain: 'operations',
        overrides: { systemMsgModal: { id: 'existing', content: 'keep' } },
        revision: 4,
        updatedBy: { actor: 'admin' }
      }
    ]);
    await MongoSystemInstanceConfig.collection.insertMany([
      {
        domain: 'subPlans',
        overrides: scopeValues.subPlans,
        revision: 2,
        schemaVersion: 1,
        explicitDefaultPaths: ['communitySupportTip']
      },
      {
        domain: 'operationalAd',
        overrides: scopeValues.operationalAd,
        revision: 3,
        schemaVersion: 1,
        explicitDefaultPaths: []
      },
      {
        domain: 'systemMsgModal',
        overrides: { content: 'older instance' },
        revision: 1,
        schemaVersion: 1,
        explicitDefaultPaths: []
      }
    ] as any);
    const sources = await MongoSystemConfigs.find({}).sort({ _id: 1 }).lean();

    await migrateLegacyConfigScopes();
    await verifyLegacyConfigScopes();
    const commercial = await MongoSystemInstanceConfig.findOne({ domain: 'commercial' }).lean();
    const operations = await MongoSystemInstanceConfig.findOne({ domain: 'operations' }).lean();
    expect(commercial).toMatchObject({
      overrides: { payment: { wx: { appId: 'existing-payment' } }, subPlans: normalizedPlans },
      explicitDefaultPaths: ['subPlans.communitySupportTip'],
      revision: 8
    });
    expect(operations).toMatchObject({
      overrides: {
        systemMsgModal: { id: 'existing', content: 'keep' },
        operationalAd: scopeValues.operationalAd,
        activityAd: scopeValues.activityAd
      },
      revision: 5
    });
    expect(
      await MongoSystemInstanceConfig.collection.countDocuments({
        domain: { $in: ['subPlans', 'systemMsgModal', 'operationalAd', 'activityAd'] }
      })
    ).toBe(0);
    expect(await MongoSystemConfigs.find({}).sort({ _id: 1 }).lean()).toEqual(sources);
    const after = await readTargets();
    await migrateLegacyConfigScopes();
    expect(await readTargets()).toEqual(after);
  });

  it('honors existing empty nested objects and explicit-default markers before obsolete invalid sources', async () => {
    await MongoSystemConfigs.create([
      { type: 'subPlans', value: { extraDatasetSize: { price: 'invalid' } } },
      { type: 'systemMsgModal', value: { content: 123 } },
      { type: 'operationalAd', value: { id: 'old-ad', operationalAdLink: 'https://old.test' } },
      { type: 'activityAd', value: { id: 'not-revived' } }
    ]);
    await MongoSystemInstanceConfig.create([
      { domain: 'commercial', overrides: { subPlans: {} }, revision: 7 },
      {
        domain: 'operations',
        overrides: { systemMsgModal: {} },
        explicitDefaultPaths: ['operationalAd.operationalAdLink', 'activityAd'],
        revision: 3
      }
    ]);
    const commercialBefore = await MongoSystemInstanceConfig.findOne({
      domain: 'commercial'
    }).lean();
    await migrateLegacyConfigScopes();
    await verifyLegacyConfigScopes();
    const operations = await MongoSystemInstanceConfig.findOne({ domain: 'operations' }).lean();
    expect(await MongoSystemInstanceConfig.findOne({ domain: 'commercial' }).lean()).toEqual(
      commercialBefore
    );
    expect(operations).toMatchObject({
      overrides: { systemMsgModal: {}, operationalAd: { id: 'old-ad' } },
      explicitDefaultPaths: ['operationalAd.operationalAdLink', 'activityAd'],
      revision: 4
    });
    const after = await readTargets();
    await migrateLegacyConfigScopes();
    expect(await readTargets()).toEqual(after);
  });

  it('keeps explicit plan leaf defaults while migrating the remaining missing source fields', async () => {
    await MongoSystemConfigs.create({
      type: 'subPlans',
      value: { ...scopeValues.subPlans, communitySupportTip: 'old tip' }
    });
    await MongoSystemInstanceConfig.create({
      domain: 'commercial',
      overrides: { showCoupon: true },
      explicitDefaultPaths: ['subPlans.communitySupportTip'],
      revision: 2
    });
    await migrateLegacyConfigScopes();
    const commercial = await MongoSystemInstanceConfig.findOne({ domain: 'commercial' }).lean();
    expect(commercial).toMatchObject({
      overrides: { showCoupon: true, subPlans: { extraPoints: normalizedPlans.extraPoints } },
      explicitDefaultPaths: ['subPlans.communitySupportTip'],
      revision: 3
    });
    expect(commercial?.overrides.subPlans).not.toHaveProperty('communitySupportTip');
  });

  it('aborts before changes and preserves old instance scopes when any selected source is invalid', async () => {
    await MongoSystemInstanceConfig.create({
      domain: 'commercial',
      overrides: { showCoupon: true },
      revision: 3
    });
    await MongoSystemInstanceConfig.collection.insertOne({
      domain: 'subPlans',
      overrides: scopeValues.subPlans,
      revision: 1,
      schemaVersion: 1,
      explicitDefaultPaths: []
    } as any);
    await MongoSystemConfigs.create({ type: 'activityAd', value: { activityAdLink: 123 } });
    const before = await readTargets();
    await expect(migrateLegacyConfigScopes()).rejects.toThrow('activityAdLink');
    expect(await readTargets()).toEqual(before);
  });

  it('retries a concurrent administrator update and never overwrites it with an older source', async () => {
    await MongoSystemInstanceConfig.create({ domain: 'commercial', overrides: {}, revision: 4 });
    await MongoSystemConfigs.create({ type: 'subPlans', value: scopeValues.subPlans });
    const collection = MongoSystemInstanceConfig.collection;
    const originalUpdateOne = collection.updateOne.bind(collection);
    let changed = false;
    const spy = vi
      .spyOn(collection, 'updateOne')
      .mockImplementation(async (filter, update, options) => {
        if (!changed && filter.domain === 'commercial') {
          changed = true;
          await originalUpdateOne(
            { domain: 'commercial', revision: 4 },
            {
              $set: { 'overrides.subPlans': {}, updatedBy: { actor: 'admin' } },
              $inc: { revision: 1 }
            }
          );
        }
        return originalUpdateOne(filter, update, options);
      });
    try {
      await migrateLegacyConfigScopes();
      expect(changed).toBe(true);
      expect(
        await MongoSystemInstanceConfig.findOne({ domain: 'commercial' }).lean()
      ).toMatchObject({
        overrides: { subPlans: {} },
        revision: 5,
        updatedBy: { actor: 'admin' }
      });
    } finally {
      spy.mockRestore();
    }
  });

  it('selects the latest instance identity deterministically when the historical fixed id is missing', async () => {
    const createTime = new Date('2026-04-01T00:00:00.000Z');
    await MongoSystemConfigs.create([
      { _id: objectId(10), type: 'instanceId', value: { instanceId: 'old' }, createTime },
      { _id: objectId(11), type: 'instanceId', value: scopeValues.instanceId, createTime }
    ]);
    await migrateLegacyConfigScopes();
    expect(
      (await MongoSystemInstanceConfig.findOne({ domain: 'instanceId' }).lean())?.overrides
    ).toEqual(scopeValues.instanceId);
  });

  it('does not create scopes when no relevant legacy data exists', async () => {
    await MongoSystemConfigs.create({ type: 'fastgpt', value: { systemEnv: {} } });
    await migrateLegacyConfigScopes();
    await verifyLegacyConfigScopes();
    expect(await readTargets()).toEqual([]);
  });

  it.each(invalidValues)(
    'rejects invalid %s before any write and reports paths only',
    async (domain, value, path) => {
      const validDomain = domain === 'subPlans' ? 'activityAd' : 'subPlans';
      await MongoSystemConfigs.create([
        { type: validDomain, value: scopeValues[validDomain] },
        { type: domain, value }
      ]);
      const error = await migrateLegacyConfigScopes().catch((error: Error) => error);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain(path);
      expect(error.message).not.toContain('private-invalid-value');
      expect(await readTargets()).toEqual([]);
    }
  );

  it('rolls back every scope when the enclosing transaction fails', async () => {
    await MongoSystemConfigs.create([
      { type: 'license', value: scopeValues.license },
      { type: 'instanceId', value: scopeValues.instanceId },
      { type: 'subPlans', value: scopeValues.subPlans }
    ]);
    await expect(
      mongoSessionRun(async (session) => {
        await migrateLegacyConfigScopes(session);
        expect(await MongoSystemInstanceConfig.countDocuments().session(session)).toBe(3);
        throw new Error('rollback');
      })
    ).rejects.toThrow('rollback');
    expect(await readTargets()).toEqual([]);
    expect(await MongoSystemConfigs.countDocuments()).toBe(3);
  });
});

describe('verifyLegacyConfigScopes', () => {
  it('rejects a missing target for every present independent source', async () => {
    for (const [type, value] of Object.entries(scopeValues)) {
      await MongoSystemConfigs.create({ type, value });
      const expectedDomain =
        type === 'subPlans'
          ? 'commercial'
          : ['systemMsgModal', 'operationalAd', 'activityAd'].includes(type)
            ? 'operations'
            : type;
      await expect(verifyLegacyConfigScopes()).rejects.toThrow(
        `Configuration scope migration incomplete: ${expectedDomain}`
      );
      await MongoSystemConfigs.deleteMany({ type });
    }
  });

  it('requires missing plans but ignores retired Langfuse sources', async () => {
    await MongoSystemConfigs.create({ type: 'fastgpt', value: { subPlans: scopeValues.subPlans } });
    await expect(verifyLegacyConfigScopes()).rejects.toThrow('migration incomplete: commercial');
    await MongoSystemConfigs.deleteMany({ type: 'fastgpt' });
    await MongoSystemConfigs.create({
      type: 'fastgpt',
      value: { systemEnv: { langfuse: { publicKey: 'legacy-public', secretKey: 'legacy-secret' } } }
    });
    await expect(verifyLegacyConfigScopes()).resolves.toBeUndefined();
  });

  it.each([
    ...invalidValues.map(([domain, value, path]) => {
      if (domain === 'subPlans') return ['commercial', { subPlans: value }, path] as const;
      if (['systemMsgModal', 'operationalAd', 'activityAd'].includes(domain)) {
        return ['operations', { [domain]: value }, path] as const;
      }
      return [domain, value, path] as const;
    }),
    ['proEnv', { teamMode: 'private-invalid-value' }, 'teamMode'] as const
  ])(
    'rejects an invalid %s target without disclosing its value',
    async (domain, overrides, path) => {
      await MongoSystemInstanceConfig.collection.insertOne({
        domain,
        overrides,
        revision: 1,
        schemaVersion: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      const error = await verifyLegacyConfigScopes().catch((error: Error) => error);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain(path);
      expect(error.message).not.toContain('private-invalid-value');
    }
  );
});
