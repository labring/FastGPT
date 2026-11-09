import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import { MongoSiteAvatarState } from '@fastgpt/service/common/s3/models/siteAvatarState';
import { SECRET_MASK } from '@fastgpt/global/common/system/config/permission';

const mocks = vi.hoisted(() => ({
  edition: 'pro' as 'pro' | 'community',
  initSystemConfig: vi.fn(),
  syncSiteAvatarLifecycle: vi.fn(),
  findMissingAvatars: vi.fn(async () => [] as string[])
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: async () => ({ userId: 'root' })
}));
vi.mock('@/service/common/system', () => ({ initSystemConfig: mocks.initSystemConfig }));
vi.mock('@/service/common/system/syncSiteAvatarLifecycle', () => ({
  syncSiteAvatarLifecycle: mocks.syncSiteAvatarLifecycle
}));
vi.mock('@fastgpt/service/common/s3/sources/avatar', () => ({
  getS3AvatarSource: () => ({
    findMissingAvatars: mocks.findMissingAvatars
  })
}));
vi.mock(
  '@fastgpt/service/common/system/systemInstanceConfig/controller',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    getServiceEdition: () => mocks.edition
  })
);

import handler from '@/pages/api/admin/system/config/update';

describe('instance config update API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.edition = 'pro';
    mocks.initSystemConfig.mockRejectedValue(new Error('Runtime apply unavailable'));
    mocks.syncSiteAvatarLifecycle.mockRejectedValue(new Error('Avatar cleanup unavailable'));
    mocks.findMissingAvatars.mockResolvedValue([]);
  });

  afterEach(async () => {
    await MongoSiteAvatarState.deleteMany({});
  });

  it('returns the committed revision without waiting for reload, cleanup or a post-commit read', async () => {
    const originalFindOne = MongoSystemInstanceConfig.findOne.bind(MongoSystemInstanceConfig);
    let reads = 0;
    // site 旧值读取和事务前校验各一次；提交后的查询故障不能影响成功结果。
    const readSpy = vi.spyOn(MongoSystemInstanceConfig, 'findOne').mockImplementation((...args) => {
      reads += 1;
      if (reads > 2) throw new Error('Post-commit read unavailable');
      return originalFindOne(...args);
    });
    // 写入链路不应自行加载全量运行时快照。
    const reloadSpy = vi.spyOn(MongoSystemInstanceConfig, 'find').mockImplementation(() => {
      throw new Error('Snapshot reload unavailable');
    });

    const response = await handler({
      body: {
        items: [{ domain: 'site', expectedRevision: 0, overrides: { name: 'Committed name' } }]
      }
    } as any);

    expect(response.results[0]).toMatchObject({
      domain: 'site',
      revision: 1,
      effectiveConfig: { name: 'Committed name' }
    });
    expect(reads).toBe(2);
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(mocks.initSystemConfig).toHaveBeenCalled();
    expect(mocks.syncSiteAvatarLifecycle).toHaveBeenCalled();
    readSpy.mockRestore();
    expect(await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean()).toMatchObject({
      revision: 1,
      overrides: { name: 'Committed name' }
    });
  });

  it('rejects a site save that re-references an avatar while its deletion is claimed', async () => {
    const avatarUrl = '/api/system/img/avatar/team-1/claimed.png';
    await MongoSystemInstanceConfig.create({
      domain: 'site',
      revision: 1,
      overrides: { favicon: '/api/system/img/avatar/team-1/current.png' },
      updatedBy: { actor: 'system' }
    });
    await MongoSiteAvatarState.create({
      avatarKey: 'avatar/team-1/claimed.png',
      state: 'deleting'
    });

    await expect(
      handler({
        body: {
          items: [
            {
              domain: 'site',
              expectedRevision: 1,
              overrides: { favicon: avatarUrl }
            }
          ]
        }
      } as any)
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean()).toMatchObject({
      revision: 1,
      overrides: { favicon: '/api/system/img/avatar/team-1/current.png' }
    });
  });

  it('clears the reservation and rejects when the avatar object is already missing', async () => {
    const avatarKey = 'avatar/team-1/missing.png';
    const avatarUrl = `/api/system/img/${avatarKey}`;
    await MongoSystemInstanceConfig.create({
      domain: 'site',
      revision: 1,
      overrides: { favicon: '' },
      updatedBy: { actor: 'system' }
    });
    mocks.findMissingAvatars.mockResolvedValueOnce([avatarKey]);

    await expect(
      handler({
        body: {
          items: [
            {
              domain: 'site',
              expectedRevision: 1,
              overrides: { favicon: avatarUrl }
            }
          ]
        }
      } as any)
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(await MongoSiteAvatarState.findOne({ avatarKey })).toBeNull();
    expect(await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean()).toMatchObject({
      revision: 1,
      overrides: { favicon: '' }
    });
  });

  it('masks secrets in the transaction result and preserves them on the next save', async () => {
    const overrides = { documentParse: { customPdf: { key: 'private-key' } } };
    const first = await handler({
      body: { items: [{ domain: 'providers', expectedRevision: 0, overrides }] }
    } as any);
    expect(first.results[0].overrides).toMatchObject({
      documentParse: { customPdf: { key: SECRET_MASK } }
    });

    const second = await handler({
      body: {
        items: [{ domain: 'providers', expectedRevision: 1, overrides: first.results[0].overrides }]
      }
    } as any);
    expect(second.results[0].revision).toBe(2);
    expect(
      (await MongoSystemInstanceConfig.findOne({ domain: 'providers' }).lean())?.overrides
    ).toMatchObject(overrides);
  });

  it('allows community fields, filters the response and rejects Pro fields before writing', async () => {
    mocks.edition = 'community';
    const response = await handler({
      body: {
        items: [{ domain: 'auth', expectedRevision: 0, overrides: { passwordExpiredMonth: 2 } }]
      }
    } as any);
    expect(response.results[0].effectiveConfig).toMatchObject({ passwordExpiredMonth: 2 });
    expect(response.results[0].effectiveConfig).not.toHaveProperty('loginProviders.email');

    await expect(
      handler({
        body: {
          items: [
            {
              domain: 'auth',
              expectedRevision: 1,
              overrides: { loginProviders: { email: { register: true } } }
            }
          ]
        }
      } as any)
    ).rejects.toThrow('Edition boundary violation');
    expect((await MongoSystemInstanceConfig.findOne({ domain: 'auth' }).lean())?.revision).toBe(1);
  });
});
