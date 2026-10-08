import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  deprecatedOverridePaths,
  hasDeprecatedOverrides,
  stripDeprecatedOverrides,
  cleanupInstanceConfigDeprecatedFields,
  verifyInstanceConfigDeprecatedFields
} from '@/migration/tasks/20260929_cleanup_instance_config_deprecated_fields/service';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';

const logger = { info: () => {}, warn: () => {}, error: () => {} };

describe('deprecatedOverridePaths', () => {
  it('covers every field removed from the instance config schemas', () => {
    const paths = Object.entries(deprecatedOverridePaths).flatMap(([domain, list]) =>
      (list ?? []).map((path) => `${domain}.${path.join('.')}`)
    );

    expect(paths).toEqual(
      expect.arrayContaining([
        'site.chineseRedirectUrl',
        'site.systemTitle',
        'performance.chat.logUrl',
        'performance.chat.logInterval',
        'performance.chat.logSourceIdPrefix',
        'storage.downloadRedirectTtlSeconds',
        'storage.downloadRedirectEndpoint',
        'feature.showWorkorder',
        'feature.showEnterpriseAuth',
        'feature.showGit',
        'vector.vqLevel',
        'vector.languageIdentifier',
        'providers.chunk',
        'providers.crm',
        'auth.loginProviders.sms.login.en',
        'auth.accountCancellation.cancellationSm.en',
        'commercial.billingNotify.paymentReceived.en'
      ])
    );
  });
});

describe('stripDeprecatedOverrides', () => {
  it('removes deprecated leaf fields and keeps the rest untouched', () => {
    const { overrides, removedFieldCount } = stripDeprecatedOverrides('vector', {
      vqLevel: 16,
      languageIdentifier: 'whatlang',
      hnswEfSearch: 200
    });

    expect(overrides).toEqual({ hnswEfSearch: 200 });
    expect(removedFieldCount).toBe(2);
  });

  it('drops parent objects that become empty after cleanup', () => {
    const { overrides } = stripDeprecatedOverrides('performance', {
      chat: { maxQpm: 100, logUrl: 'http://log', logInterval: 5000, logSourceIdPrefix: 'p-' },
      workflow: { maxRunTimes: 700 }
    });

    expect(overrides).toEqual({
      chat: { maxQpm: 100 },
      workflow: { maxRunTimes: 700 }
    });
  });

  it('removes an emptied nested chain across multiple deprecated siblings', () => {
    const { overrides, removedFieldCount } = stripDeprecatedOverrides('auth', {
      loginProviders: {
        sms: {
          login: { zh: '登录', en: 'login' },
          register: { zh: '注册', en: 'register' }
        }
      }
    });

    expect(overrides).toEqual({
      loginProviders: { sms: { login: { zh: '登录' }, register: { zh: '注册' } } }
    });
    expect(removedFieldCount).toBe(2);
  });

  it('removes the whole branch when nothing remains', () => {
    const { overrides } = stripDeprecatedOverrides('providers', {
      chunk: { url: 'https://chunk.example.com', timeoutMinutes: 60 },
      crm: { apiUrl: 'https://crm.example.com' }
    });

    expect(overrides).toEqual({});
  });

  it('is idempotent and does not mutate the input', () => {
    const input = { vqLevel: 32, hnswEfSearch: 100 };

    const first = stripDeprecatedOverrides('vector', input);
    const second = stripDeprecatedOverrides('vector', first.overrides);

    expect(input).toEqual({ vqLevel: 32, hnswEfSearch: 100 });
    expect(second).toEqual({ overrides: { hnswEfSearch: 100 }, removedFieldCount: 0 });
  });

  it('returns zero removals for domains without deprecated fields', () => {
    const { overrides, removedFieldCount } = stripDeprecatedOverrides('security', {
      csrfEnabled: true
    });

    expect(overrides).toEqual({ csrfEnabled: true });
    expect(removedFieldCount).toBe(0);
  });
});

describe('hasDeprecatedOverrides', () => {
  it('detects deprecated fields at any depth', () => {
    expect(hasDeprecatedOverrides('storage', { downloadRedirectTtlSeconds: 300 })).toBe(true);
    expect(
      hasDeprecatedOverrides('commercial', { billingNotify: { expired: { zh: 'x', en: 'y' } } })
    ).toBe(true);
  });

  it('returns false when only supported fields remain', () => {
    expect(hasDeprecatedOverrides('storage', { fileUrlExpiredDays: 90 })).toBe(false);
    expect(hasDeprecatedOverrides('site', { name: 'AI' })).toBe(false);
    expect(hasDeprecatedOverrides('site', {})).toBe(false);
  });

  it('ignores deprecated fields listed for a different domain', () => {
    // vqLevel 属于 vector，不应在 site 下被判定为残留
    expect(hasDeprecatedOverrides('site', { vqLevel: 32 })).toBe(false);
  });
});

describe('cleanupInstanceConfigDeprecatedFields (integration)', () => {
  // 集合 schema validator 会拒绝含废弃字段的写入，测试必须走原生驱动插入脏数据，
  // 模拟旧版本遗留记录。
  const seedDirtyDoc = async (doc: {
    _id: string;
    revision: number;
    overrides: Record<string, unknown>;
  }) => {
    await MongoSystemInstanceConfig.collection.insertOne({
      _id: doc._id,
      schemaVersion: 1,
      revision: doc.revision,
      overrides: doc.overrides,
      updatedBy: { actor: 'system' },
      createdAt: new Date(),
      updatedAt: new Date()
    });
  };

  beforeEach(async () => {
    await MongoSystemInstanceConfig.deleteMany({});
  });

  it('cleans deprecated fields and passes verification', async () => {
    await seedDirtyDoc({
      _id: 'vector',
      revision: 1,
      overrides: { vqLevel: 32, hnswEfSearch: 200 }
    });

    const result = await cleanupInstanceConfigDeprecatedFields({ logger });
    expect(result.updatedDomains).toEqual(['vector']);
    expect(result.removedFieldCount).toBe(1);

    const doc = await MongoSystemInstanceConfig.findById('vector').lean();
    expect(doc?.overrides).toEqual({ hnswEfSearch: 200 });

    const verification = await verifyInstanceConfigDeprecatedFields();
    expect(verification.remainingDocuments).toEqual([]);
    expect(verification.invalidDomains).toEqual([]);
  });

  it('wraps schema rejection with the domain name for diagnosability', async () => {
    // logUrl 属废弃字段会被剔除，但残留的 maxRunTimes=0 违反 positiveInteger；
    // blockStartup 下终审错误必须能定位到具体域。
    await seedDirtyDoc({
      _id: 'performance',
      revision: 1,
      overrides: { workflow: { maxRunTimes: 0 }, chat: { logUrl: 'http://legacy' } }
    });

    await expect(cleanupInstanceConfigDeprecatedFields({ logger })).rejects.toThrow(
      /domain "performance"/
    );
  });

  it('retries cleanup against the latest doc after a concurrent revision bump', async () => {
    await seedDirtyDoc({
      _id: 'vector',
      revision: 1,
      overrides: { vqLevel: 32, hnswEfSearch: 200 }
    });

    // 模拟并发：首次条件更新返回 null（revision 被他人推进），重试路径应基于最新文档再次清理。
    // 代码对 findOneAndUpdate 结果链式调用 .lean()，mock 必须返回同形状的查询对象。
    const original = MongoSystemInstanceConfig.findOneAndUpdate.bind(MongoSystemInstanceConfig);
    let firstCall = true;
    const spy = vi.spyOn(MongoSystemInstanceConfig, 'findOneAndUpdate').mockImplementation(((
      filter: any,
      update: any,
      options: any
    ) => {
      if (firstCall) {
        firstCall = false;
        return { lean: () => Promise.resolve(null) } as any;
      }
      return original(filter, update, options);
    }) as any);

    const result = await cleanupInstanceConfigDeprecatedFields({ logger });
    spy.mockRestore();

    // 重试分支成功补齐清理，域仍计入 updatedDomains
    expect(result.updatedDomains).toEqual(['vector']);
    expect(result.removedFieldCount).toBe(1);

    const doc = await MongoSystemInstanceConfig.findById('vector').lean();
    expect(doc?.overrides).toEqual({ hnswEfSearch: 200 });

    const verification = await verifyInstanceConfigDeprecatedFields();
    expect(verification.remainingDocuments).toEqual([]);
  });
});
