import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  // 共享 setup 可能已加载控制器；清空模块缓存后再隔离持久化依赖。
  vi.resetModules();
  return {
    documents: {} as Record<
      string,
      { domain: string; revision: number; overrides: Record<string, unknown> }
    >,
    update: vi.fn(),
    transaction: vi.fn()
  };
});

// 保留完整的合并、Schema 校验与保存控制器，仅隔离数据库、事务和部署 vendor。
vi.mock('@fastgpt/service/common/system/systemInstanceConfig/schema', () => ({
  MongoSystemInstanceConfig: {
    findOne: ({ domain }: { domain: string }) => ({
      lean: async () => mocks.documents[domain] ?? null
    }),
    findOneAndUpdate: mocks.update
  }
}));
vi.mock('@fastgpt/service/common/system/config/schema', () => ({ MongoSystemConfigs: {} }));
vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: mocks.transaction
}));
vi.mock('@fastgpt/service/env', () => ({ serviceEnv: { STORAGE_VENDOR: 'minio' } }));
vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => ({ error: vi.fn() }),
  LogCategories: { SYSTEM: 'system' }
}));
vi.mock('@fastgpt/service/common/system/migrationCoverageLog', () => ({
  logInstanceConfigRead: vi.fn()
}));

import { batchUpdateDomainConfigs } from '@fastgpt/service/common/system/systemInstanceConfig/controller';

describe('batchUpdateDomainConfigs storage validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.documents = {
      storage: {
        domain: 'storage',
        revision: 3,
        overrides: {
          downloadMode: 'short-redirect',
          externalEndpoint: 'https://storage.example.com'
        }
      },
      site: { domain: 'site', revision: 1, overrides: { name: 'Saved name' } }
    };
    mocks.transaction.mockImplementation(async (write) => write({}));
    mocks.update.mockImplementation(({ domain, revision }, update) => ({
      lean: async () => ({ domain, revision: revision + 1, ...update.$set })
    }));
  });

  it('accepts a CDN-only patch using the existing external endpoint', async () => {
    const [saved] = await batchUpdateDomainConfigs({
      items: [
        {
          domain: 'storage',
          expectedRevision: 3,
          overrides: { cdnEndpoint: 'https://cdn.example.com' }
        }
      ],
      actor: { actor: 'admin' }
    });

    expect(saved.revision).toBe(4);
    expect(saved.effectiveConfig).toMatchObject({
      downloadMode: 'short-redirect',
      externalEndpoint: 'https://storage.example.com',
      cdnEndpoint: 'https://cdn.example.com'
    });
    expect(mocks.update.mock.calls[0][1].$set.overrides).toEqual(saved.overrides);
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });

  it('rejects clearing the endpoint of an existing redirect policy before any domain is written', async () => {
    const before = structuredClone(mocks.documents);
    await expect(
      batchUpdateDomainConfigs({
        items: [
          { domain: 'site', expectedRevision: 1, overrides: { name: 'Do not save' } },
          { domain: 'storage', expectedRevision: 3, overrides: { externalEndpoint: '' } }
        ],
        actor: { actor: 'admin' }
      })
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('MinIO') });

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.documents).toEqual(before);
  });
});
