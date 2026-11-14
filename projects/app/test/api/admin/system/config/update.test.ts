import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import { MongoTeamAudit } from '@fastgpt/service/support/user/audit/schema';
import * as auditUtils from '@fastgpt/service/support/user/audit/util';
import { AdminAuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { SECRET_MASK } from '@fastgpt/global/common/system/config/permission';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';

vi.hoisted(() => vi.resetModules());
vi.unmock('@fastgpt/service/support/user/audit/util');

const mocks = vi.hoisted(() => ({
  edition: 'pro' as 'pro' | 'community',
  teamId: '68ad85a7463006c963799a05',
  tmbId: '68ad85a7463006c963799a06',
  initSystemConfig: vi.fn(),
  syncSiteAvatarLifecycle: vi.fn(),
  copyForSiteReference: vi.fn(async ({ avatar }: { avatar: string }) => avatar)
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: async () => ({ userId: 'root', teamId: mocks.teamId, tmbId: mocks.tmbId })
}));
vi.mock('@/service/common/system', () => ({ initSystemConfig: mocks.initSystemConfig }));
vi.mock('@/service/common/system/syncSiteAvatarLifecycle', () => ({
  syncSiteAvatarLifecycle: mocks.syncSiteAvatarLifecycle
}));
vi.mock('@fastgpt/service/common/s3/sources/avatar', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getS3AvatarSource: () => ({
    copyForSiteReference: mocks.copyForSiteReference
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
    vi.clearAllMocks();
    mocks.edition = 'pro';
    mocks.initSystemConfig.mockRejectedValue(new Error('Runtime apply unavailable'));
    mocks.syncSiteAvatarLifecycle.mockRejectedValue(new Error('Avatar cleanup unavailable'));
    mocks.copyForSiteReference.mockImplementation(async ({ avatar }: { avatar: string }) => avatar);
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
    await vi.waitFor(async () => {
      const audit = await MongoTeamAudit.findOne({
        event: AdminAuditEventEnum.ADMIN_UPDATE_SYSTEM_CONFIG
      }).lean();
      expect(audit).toMatchObject({ metadata: { name: 'root' } });
      expect(String(audit?.teamId)).toBe(mocks.teamId);
      expect(String(audit?.tmbId)).toBe(mocks.tmbId);
    });
  });

  it('does not start avatar cleanup when a stale revision rejects the save', async () => {
    await MongoSystemInstanceConfig.create({
      domain: 'site',
      revision: 1,
      overrides: { favicon: '/api/system/img/avatar/team/current.png' },
      updatedBy: { actor: 'system' }
    });

    await expect(
      handler({
        body: {
          items: [
            {
              domain: 'site',
              expectedRevision: 0,
              overrides: { favicon: '/api/system/img/avatar/team/new.png' }
            }
          ]
        }
      } as any)
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(mocks.syncSiteAvatarLifecycle).not.toHaveBeenCalled();
    expect(await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean()).toMatchObject({
      revision: 1,
      overrides: { favicon: '/api/system/img/avatar/team/current.png' }
    });
    expect(
      await MongoTeamAudit.countDocuments({ event: AdminAuditEventEnum.ADMIN_UPDATE_SYSTEM_CONFIG })
    ).toBe(0);
  });

  it.each([{ favicon: 7 }, { navbarItems: 'invalid' }, { navbarItems: [null] }])(
    'rejects malformed site avatar values before preprocessing: %j',
    async (overrides) => {
      await expect(
        handler({
          body: {
            items: [{ domain: 'site', expectedRevision: 0, overrides }]
          }
        } as any)
      ).rejects.toBeInstanceOf(ApiRequestInputParseError);

      expect(mocks.copyForSiteReference).not.toHaveBeenCalled();
      expect(await MongoSystemInstanceConfig.findOne({ domain: 'site' })).toBeNull();
    }
  );

  it('copies a newly referenced site avatar and saves the independent object URL', async () => {
    const previousAvatar = '/api/system/img/avatar/team/current.png';
    const nextAvatar = '/api/system/img/avatar/team/next.png';
    const copiedAvatar = '/api/system/img/avatar/site/file/copied-next.png';
    await MongoSystemInstanceConfig.create({
      domain: 'site',
      revision: 1,
      overrides: { favicon: previousAvatar },
      updatedBy: { actor: 'system' }
    });
    mocks.copyForSiteReference.mockResolvedValueOnce(copiedAvatar);

    const response = await handler({
      body: {
        items: [
          {
            domain: 'site',
            expectedRevision: 1,
            overrides: { favicon: nextAvatar }
          }
        ]
      }
    } as any);

    expect(mocks.copyForSiteReference).toHaveBeenCalledWith({ avatar: nextAvatar });
    expect(response.results[0].overrides.favicon).toBe(copiedAvatar);
    expect(await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean()).toMatchObject({
      revision: 2,
      overrides: { favicon: copiedAvatar }
    });
    await vi.waitFor(async () => {
      expect(
        await MongoTeamAudit.countDocuments({
          event: AdminAuditEventEnum.ADMIN_UPDATE_SYSTEM_CONFIG
        })
      ).toBe(1);
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
    await vi.waitFor(async () => {
      const auditLogs = await MongoTeamAudit.find({
        event: AdminAuditEventEnum.ADMIN_UPDATE_SYSTEM_CONFIG
      }).lean();
      expect(auditLogs).toHaveLength(2);
      for (const audit of auditLogs) {
        expect(String(audit.teamId)).toBe(mocks.teamId);
        expect(String(audit.tmbId)).toBe(mocks.tmbId);
        expect(audit.metadata).toEqual({ name: 'root' });
      }
      expect(JSON.stringify(auditLogs)).not.toContain('private-key');
    });
  });

  it('returns the committed config when audit writing fails', async () => {
    const auditSpy = vi
      .spyOn(auditUtils, 'addAuditLog')
      .mockRejectedValueOnce(new Error('audit failed'));

    const response = await handler({
      body: {
        items: [{ domain: 'auth', expectedRevision: 0, overrides: { passwordExpiredMonth: 2 } }]
      }
    } as any);

    expect(response.results[0]).toMatchObject({ domain: 'auth', revision: 1 });
    expect(await MongoSystemInstanceConfig.findOne({ domain: 'auth' }).lean()).toMatchObject({
      revision: 1,
      overrides: { passwordExpiredMonth: 2 }
    });
    expect(auditSpy).toHaveBeenCalledOnce();
    expect(
      await MongoTeamAudit.countDocuments({ event: AdminAuditEventEnum.ADMIN_UPDATE_SYSTEM_CONFIG })
    ).toBe(0);
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
    await vi.waitFor(async () => {
      expect(
        await MongoTeamAudit.countDocuments({
          event: AdminAuditEventEnum.ADMIN_UPDATE_SYSTEM_CONFIG
        })
      ).toBe(1);
    });
  });

  it('rejects saving sync teamMode when EXTERNAL_USER_SYSTEM_BASE_URL is not configured or SSO status is unavailable', async () => {
    const originalSsoHandler = global.getSsoConfiguredHandler;
    try {
      global.getSsoConfiguredHandler = () => false;
      await expect(
        handler({
          body: {
            items: [
              { domain: 'auth', expectedRevision: 0, overrides: { teamMode: 'sync' } },
              {
                domain: 'site',
                expectedRevision: 0,
                overrides: { favicon: '/api/system/img/avatar/team/new.png' }
              }
            ]
          }
        } as any)
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('EXTERNAL_USER_SYSTEM_BASE_URL')
      });
      expect(mocks.copyForSiteReference).not.toHaveBeenCalled();
      expect(await MongoSystemInstanceConfig.countDocuments({})).toBe(0);

      global.getSsoConfiguredHandler = () => {
        throw new Error('private-pro-token');
      };
      await expect(
        handler({
          body: {
            items: [{ domain: 'auth', expectedRevision: 0, overrides: { teamMode: 'sync' } }]
          }
        } as any)
      ).rejects.toMatchObject({
        statusCode: 503
      });
      expect(await MongoSystemInstanceConfig.countDocuments({})).toBe(0);

      global.getSsoConfiguredHandler = () => true;
      const saved = await handler({
        body: {
          items: [{ domain: 'auth', expectedRevision: 0, overrides: { teamMode: 'sync' } }]
        }
      } as any);
      expect(saved.results[0].effectiveConfig).toMatchObject({ teamMode: 'sync' });
    } finally {
      global.getSsoConfiguredHandler = originalSsoHandler;
    }
  });

  it('copies a newly uploaded auth.sso.icon and triggers avatar lifecycle sync', async () => {
    const uploadedIcon = '/api/system/img/avatar/team/sso-uploaded.png';
    const copiedIcon = '/api/system/img/avatar/site/file/sso-copied.png';
    mocks.copyForSiteReference.mockResolvedValueOnce(copiedIcon);

    const response = await handler({
      body: {
        items: [
          {
            domain: 'auth',
            expectedRevision: 0,
            overrides: { sso: { icon: uploadedIcon } }
          }
        ]
      }
    } as any);

    expect(mocks.copyForSiteReference).toHaveBeenCalledWith({ avatar: uploadedIcon });
    expect(response.results[0].overrides).toMatchObject({ sso: { icon: copiedIcon } });
    expect(mocks.syncSiteAvatarLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        next: expect.objectContaining({
          sso: expect.objectContaining({ icon: copiedIcon })
        })
      })
    );
  });
});
