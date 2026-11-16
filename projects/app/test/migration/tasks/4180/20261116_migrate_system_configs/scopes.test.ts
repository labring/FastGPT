import { describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  migrateLegacyConfigScopes,
  verifyLegacyConfigScopes
} from '@/migration/tasks/4180/20261116_migrate_system_configs/scopes';

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
  langfuse: {
    publicKey: 'synthetic-public',
    secretKey: 'synthetic-secret',
    baseUrl: 'https://trace.test',
    legacyField: 'retained'
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
  ['langfuse', { secretKey: { private: 'private-invalid-value' } }, 'secretKey'],
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
  it('migrates all nine latest scopes, preserves the bound license and old records, and leaves Pro ENV untouched', async () => {
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
    expect(targets).toHaveLength(10);
    for (const [domain, value] of entries) {
      const target = targets.find((doc) => doc.domain === domain);
      const expected = domain === 'subPlans' ? normalizedPlans : value;
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
      (await MongoSystemInstanceConfig.findOne({ domain: 'systemMsgModal' }).lean())?.overrides
    ).toEqual(scopeValues.systemMsgModal);
  });

  it('uses the highest-id fastgpt snapshot for missing plans and tracing, without importing legacy Pro ENV', async () => {
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
        value: { subPlans: scopeValues.subPlans, systemEnv: { langfuse: scopeValues.langfuse } }
      },
      { type: 'proEnv', value: { teamMode: 'multi' } }
    ]);
    await migrateLegacyConfigScopes();
    await verifyLegacyConfigScopes();
    expect(
      (await MongoSystemInstanceConfig.findOne({ domain: 'subPlans' }).lean())?.overrides
    ).toEqual(normalizedPlans);
    expect(
      (await MongoSystemInstanceConfig.findOne({ domain: 'langfuse' }).lean())?.overrides
    ).toEqual(scopeValues.langfuse);
    expect(await MongoSystemInstanceConfig.findOne({ domain: 'proEnv' }).lean()).toBeNull();
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
      await expect(verifyLegacyConfigScopes()).rejects.toThrow(
        `Configuration scope migration incomplete: ${type}`
      );
      await MongoSystemConfigs.deleteMany({ type });
    }
  });

  it('rejects a missing target for either fallback source', async () => {
    await MongoSystemConfigs.create({ type: 'fastgpt', value: { subPlans: scopeValues.subPlans } });
    await expect(verifyLegacyConfigScopes()).rejects.toThrow('migration incomplete: subPlans');
    await MongoSystemConfigs.deleteMany({ type: 'fastgpt' });
    await MongoSystemConfigs.create({
      type: 'fastgpt',
      value: { systemEnv: { langfuse: scopeValues.langfuse } }
    });
    await expect(verifyLegacyConfigScopes()).rejects.toThrow('migration incomplete: langfuse');
  });

  it.each([
    ...invalidValues,
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
