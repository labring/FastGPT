import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import { MongoTeamAudit } from '@fastgpt/service/support/user/audit/schema';
import * as auditUtils from '@fastgpt/service/support/user/audit/util';
import { AdminAuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';
import type { UpdateDomainConfigResponse } from '@fastgpt/global/openapi/admin/system/instanceConfig/api';

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
import { getDomainConfigForAdmin } from '@fastgpt/service/common/system/systemInstanceConfig/controller';

const callUpdate = handler as unknown as (request: {
  body: unknown;
}) => Promise<UpdateDomainConfigResponse>;

describe('instance config update API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.edition = 'pro';
    mocks.initSystemConfig.mockRejectedValue(new Error('Runtime apply unavailable'));
    mocks.syncSiteAvatarLifecycle.mockRejectedValue(new Error('Avatar cleanup unavailable'));
    mocks.copyForSiteReference.mockImplementation(async ({ avatar }: { avatar: string }) => avatar);
  });

  it('allows community admins to save and read Agent Sandbox while keeping secrets encrypted', async () => {
    mocks.edition = 'community';
    const proxySecret = 'community-proxy-secret-at-least-32-characters';
    const agentSandbox = {
      provider: 'opensandbox',
      proxy: { wsUrl: 'wss://proxy.test', previewUrl: 'https://preview.test', secret: proxySecret },
      common: { cpuCount: 2, memoryMiB: 4096 },
      opensandbox: {
        baseUrl: 'https://sandbox.test',
        apiKey: 'community-provider-key',
        runtime: 'kubernetes',
        cpuOvercommitFactor: 2,
        memoryOvercommitFactor: 3
      },
      sealosdevbox: { baseUrl: 'https://devbox.test', token: 'community-devbox-token' }
    };
    const response = await callUpdate({
      body: {
        items: [{ domain: 'subservice', expectedRevision: 0, overrides: { agentSandbox } }]
      }
    });
    expect(response.results[0]).toMatchObject({ domain: 'subservice', revision: 1 });
    const config = await getDomainConfigForAdmin('subservice', 'community');
    expect(config.effectiveConfig.agentSandbox).toMatchObject({
      provider: 'opensandbox',
      proxy: { wsUrl: 'wss://proxy.test', previewUrl: 'https://preview.test' },
      common: { cpuCount: 2, memoryMiB: 4096 },
      opensandbox: {
        baseUrl: 'https://sandbox.test',
        cpuOvercommitFactor: 2,
        memoryOvercommitFactor: 3
      }
    });
    expect(config.configuredSecretKeys).toEqual(
      expect.arrayContaining([
        'agentSandbox.proxy.secret',
        'agentSandbox.opensandbox.apiKey',
        'agentSandbox.sealosdevbox.token'
      ])
    );
    const stored = await MongoSystemInstanceConfig.findOne({ domain: 'subservice' }).lean();
    expect(stored?.overrides).toHaveProperty(
      'agentSandbox.proxy.secret.secret',
      expect.any(String)
    );
    for (const secret of [proxySecret, 'community-provider-key', 'community-devbox-token']) {
      expect(JSON.stringify(stored)).not.toContain(secret);
      expect(JSON.stringify(config)).not.toContain(secret);
      expect(JSON.stringify(response)).not.toContain(secret);
    }
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

    const response = await callUpdate({
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

  it('rejects the ENV-only proEnv scope at the admin API boundary', async () => {
    await expect(
      callUpdate({
        body: {
          items: [{ domain: 'proEnv', expectedRevision: 0, overrides: { teamMode: 'multi' } }]
        }
      } as any)
    ).rejects.toThrow();
    expect(await MongoSystemInstanceConfig.countDocuments({ domain: 'proEnv' })).toBe(0);
    expect(mocks.initSystemConfig).not.toHaveBeenCalled();
  });

  it('does not start avatar cleanup when a stale revision rejects the save', async () => {
    await MongoSystemInstanceConfig.create({
      domain: 'site',
      revision: 1,
      overrides: { favicon: '/api/system/img/avatar/team/current.png' },
      updatedBy: { actor: 'system' }
    });

    await expect(
      callUpdate({
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
        callUpdate({
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

    const response = await callUpdate({
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

  it('omits secrets from save responses while preserving, replacing and clearing them', async () => {
    const overrides = { documentParse: { customPdf: { key: 'private-key' } } };
    const first = await callUpdate({
      body: { items: [{ domain: 'providers', expectedRevision: 0, overrides }] }
    } as any);
    const firstResult = first.results[0];
    expect(firstResult.overrides).not.toHaveProperty('documentParse.customPdf.key');
    expect(firstResult.effectiveConfig).not.toHaveProperty('documentParse.customPdf.key');
    expect(firstResult.secretKeys).toContain('documentParse.customPdf.key');
    expect(firstResult.configuredSecretKeys).toContain('documentParse.customPdf.key');
    const stored = await MongoSystemInstanceConfig.findOne({ domain: 'providers' }).lean();
    const storedOverrides = stored?.overrides as
      | { documentParse?: { customPdf?: { key?: { secret: string } } } }
      | undefined;
    const firstCipher = storedOverrides?.documentParse?.customPdf?.key;
    expect(firstCipher).toEqual({ secret: expect.any(String) });
    expect(JSON.stringify(firstResult)).not.toContain('private-key');
    expect(JSON.stringify(firstResult)).not.toContain(firstCipher?.secret ?? '');
    expect(JSON.stringify(firstResult)).not.toContain('******');

    const second = await callUpdate({
      body: {
        items: [{ domain: 'providers', expectedRevision: 1, overrides: firstResult.overrides }]
      }
    } as any);
    expect(second.results[0].revision).toBe(2);
    expect(
      (await MongoSystemInstanceConfig.findOne({ domain: 'providers' }).lean())?.overrides
    ).toMatchObject({ documentParse: { customPdf: { key: firstCipher } } });

    const replaced = await callUpdate({
      body: {
        items: [
          {
            domain: 'providers',
            expectedRevision: 2,
            overrides: { documentParse: { customPdf: { key: '******' } } }
          }
        ]
      }
    } as any);
    expect(replaced.results[0].configuredSecretKeys).toContain('documentParse.customPdf.key');
    expect(replaced.results[0].effectiveConfig).not.toHaveProperty('documentParse.customPdf.key');
    expect(JSON.stringify(replaced)).not.toContain('******');

    const cleared = await callUpdate({
      body: {
        items: [
          {
            domain: 'providers',
            expectedRevision: 3,
            overrides: { documentParse: { customPdf: { key: '' } } }
          }
        ]
      }
    } as any);
    expect(cleared.results[0].secretKeys).toContain('documentParse.customPdf.key');
    expect(cleared.results[0].configuredSecretKeys).not.toContain('documentParse.customPdf.key');
    expect(cleared.results[0].effectiveConfig).not.toHaveProperty('documentParse.customPdf.key');
    expect(
      (await MongoSystemInstanceConfig.findOne({ domain: 'providers' }).lean())?.overrides
    ).not.toHaveProperty('documentParse.customPdf.key');

    await vi.waitFor(async () => {
      const auditLogs = await MongoTeamAudit.find({
        event: AdminAuditEventEnum.ADMIN_UPDATE_SYSTEM_CONFIG
      }).lean();
      expect(auditLogs).toHaveLength(4);
      for (const audit of auditLogs) {
        expect(String(audit.teamId)).toBe(mocks.teamId);
        expect(String(audit.tmbId)).toBe(mocks.tmbId);
        expect(audit.metadata).toEqual({ name: 'root' });
      }
      expect(JSON.stringify(auditLogs)).not.toContain('private-key');
      expect(JSON.stringify(auditLogs)).not.toContain(firstCipher?.secret ?? '');
    });
  });

  it('returns the committed config when audit writing fails', async () => {
    const auditSpy = vi
      .spyOn(auditUtils, 'addAuditLog')
      .mockRejectedValueOnce(new Error('audit failed'));

    const response = await callUpdate({
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

  it.each([{ name: 'Custom brand' }, { favicon: '/api/system/img/avatar/custom-logo.png' }])(
    'rejects community site branding changes before writing or copying images: %j',
    async (overrides) => {
      mocks.edition = 'community';
      await expect(
        callUpdate({
          body: { items: [{ domain: 'site', expectedRevision: 0, overrides }] }
        } as any)
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(await MongoSystemInstanceConfig.countDocuments({ domain: 'site' })).toBe(0);
      expect(mocks.copyForSiteReference).not.toHaveBeenCalled();
      expect(mocks.initSystemConfig).not.toHaveBeenCalled();
      expect(mocks.syncSiteAvatarLifecycle).not.toHaveBeenCalled();
    }
  );

  it.each([
    { enableTeamPluginUpload: true },
    { enableTeamModel: true },
    { showDatasetFeishu: false },
    { showPublishWechat: false },
    { hideChatCopyrightSetting: true }
  ])('rejects community feature switch overrides before writing: %j', async (overrides) => {
    mocks.edition = 'community';
    await expect(
      callUpdate({
        body: { items: [{ domain: 'feature', expectedRevision: 0, overrides }] }
      } as any)
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(await MongoSystemInstanceConfig.countDocuments({ domain: 'feature' })).toBe(0);
    expect(mocks.initSystemConfig).not.toHaveBeenCalled();
  });

  it('allows community fields, filters the response and rejects Pro fields before writing', async () => {
    mocks.edition = 'community';
    const response = await callUpdate({
      body: {
        items: [{ domain: 'auth', expectedRevision: 0, overrides: { openApiKeyMaxCount: 200 } }]
      }
    } as any);
    expect(response.results[0].effectiveConfig).toMatchObject({ openApiKeyMaxCount: 200 });
    expect(response.results[0].effectiveConfig).not.toHaveProperty('passwordExpiredMonth');
    expect(response.results[0].effectiveConfig).not.toHaveProperty('loginProviders.email');

    await expect(
      callUpdate({
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

  it('rejects community account/login strategy changes before writing', async () => {
    mocks.edition = 'community';
    for (const [domain, overrides] of [
      ['auth', { passwordExpiredMonth: 3 }],
      ['security', { passwordLoginMinuteLimitCount: 20 }],
      ['security', { maxLoginSession: 20 }]
    ] as const) {
      await expect(
        callUpdate({ body: { items: [{ domain, expectedRevision: 0, overrides }] } })
      ).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(await MongoSystemInstanceConfig.countDocuments({})).toBe(0);
    expect(mocks.initSystemConfig).not.toHaveBeenCalled();
  });

  it.each(['single', 'multi', 'sync'])(
    'rejects retired teamMode=%s before any database or avatar write',
    async (teamMode) => {
      await expect(
        callUpdate({
          body: {
            items: [
              { domain: 'auth', expectedRevision: 0, overrides: { teamMode } },
              {
                domain: 'site',
                expectedRevision: 0,
                overrides: { favicon: '/api/system/img/avatar/team/new.png' }
              }
            ]
          }
        } as any)
      ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('TEAM_MODE') });
      expect(mocks.copyForSiteReference).not.toHaveBeenCalled();
      expect(await MongoSystemInstanceConfig.countDocuments({})).toBe(0);
    }
  );

  it('copies a newly uploaded auth.sso.icon and triggers avatar lifecycle sync', async () => {
    const uploadedIcon = '/api/system/img/avatar/team/sso-uploaded.png';
    const copiedIcon = '/api/system/img/avatar/site/file/sso-copied.png';
    mocks.copyForSiteReference.mockResolvedValueOnce(copiedIcon);

    const response = await callUpdate({
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
