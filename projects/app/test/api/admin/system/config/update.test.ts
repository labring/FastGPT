import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import { MongoTeamAudit } from '@fastgpt/service/support/user/audit/schema';
import * as auditUtils from '@fastgpt/service/support/user/audit/util';
import { AdminAuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';
import type { UpdateDomainConfigResponse } from '@fastgpt/global/openapi/admin/system/instanceConfig/api';

vi.hoisted(() => vi.resetModules());
vi.unmock('@fastgpt/service/common/mongo/sessionRun');
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
      enabled: true,
      proxy: { wsUrl: 'wss://proxy.test', previewUrl: 'https://preview.test', secret: proxySecret },
      common: { cpuCount: 2, memoryMiB: 4096 },
      opensandbox: {
        baseUrl: 'https://sandbox.test',
        apiKey: 'community-provider-key',
        image: 'fastgpt-agent-sandbox:v0.5.0',
        volumeManagerUrl: 'https://volume.test',
        volumeManagerToken: 'vm-token',
        runtime: 'kubernetes',
        cpuOvercommitFactor: 2,
        memoryOvercommitFactor: 3
      }
    };
    const response = await callUpdate({
      body: {
        items: [{ domain: 'subservice', expectedRevision: 0, overrides: { agentSandbox } }]
      }
    });
    expect(response.results[0]).toMatchObject({ domain: 'subservice', revision: 1 });
    const config = await getDomainConfigForAdmin('subservice', 'community');
    expect(config.effectiveConfig.agentSandbox).toMatchObject({
      enabled: true,
      proxy: { wsUrl: 'wss://proxy.test', previewUrl: 'https://preview.test' },
      common: { cpuCount: 2, memoryMiB: 4096 },
      opensandbox: {
        baseUrl: 'https://sandbox.test',
        cpuOvercommitFactor: 2,
        memoryOvercommitFactor: 3
      }
    });
    for (const path of ['agentSandbox.proxy.secret', 'agentSandbox.opensandbox.apiKey']) {
      expect(config.effectiveConfig).toHaveProperty(path, { isSecret: true });
    }
    const stored = await MongoSystemInstanceConfig.findOne({ domain: 'subservice' }).lean();
    expect(stored?.overrides).toHaveProperty(
      'agentSandbox.proxy.secret.secret',
      expect.any(String)
    );
    for (const secret of [proxySecret, 'community-provider-key']) {
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
    expect(mocks.initSystemConfig).toHaveBeenCalledWith();
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

  it('awaits initSystemConfig before returning so immediate getInitData reads the refreshed snapshot', async () => {
    let releaseReload!: () => void;
    let reloaded = false;
    mocks.initSystemConfig.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseReload = () => {
            reloaded = true;
            resolve();
          };
        })
    );

    let finished = false;
    const pending = callUpdate({
      body: {
        items: [{ domain: 'site', expectedRevision: 0, overrides: { name: 'Refreshed name' } }]
      }
    } as any).then((res) => {
      finished = true;
      return res;
    });

    await vi.waitFor(() => expect(mocks.initSystemConfig).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(finished).toBe(false);

    releaseReload();
    const response = await pending;
    expect(reloaded).toBe(true);
    expect(response.results[0]).toMatchObject({
      domain: 'site',
      revision: 1,
      effectiveConfig: { name: 'Refreshed name' }
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
    expect(firstResult.overrides).toHaveProperty('documentParse.customPdf.key', { isSecret: true });
    expect(firstResult.effectiveConfig).toHaveProperty('documentParse.customPdf.key', {
      isSecret: true
    });
    expect(firstResult).not.toHaveProperty('secretKeys');
    expect(firstResult).not.toHaveProperty('configuredSecretKeys');
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
    expect(replaced.results[0].effectiveConfig).toHaveProperty('documentParse.customPdf.key', {
      isSecret: true
    });
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
    expect(cleared.results[0].effectiveConfig).toHaveProperty('documentParse.customPdf.key', '');
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

  it.each([
    { isSecret: false },
    { isSecret: 'true' },
    { isSecret: true, secret: 'client-cipher' },
    { isSecret: true, extra: 'unexpected' },
    { secret: 'client-cipher' }
  ])('rejects malformed preservation markers without writing configuration: %j', async (key) => {
    await expect(
      callUpdate({
        body: {
          items: [
            {
              domain: 'providers',
              expectedRevision: 0,
              overrides: { documentParse: { customPdf: { key } } }
            }
          ]
        }
      })
    ).rejects.toBeInstanceOf(ApiRequestInputParseError);
    expect(await MongoSystemInstanceConfig.countDocuments({ domain: 'providers' })).toBe(0);
  });

  it('accepts a preservation marker for an unconfigured secret without storing the marker', async () => {
    const result = await callUpdate({
      body: {
        items: [
          {
            domain: 'providers',
            expectedRevision: 0,
            overrides: { documentParse: { customPdf: { key: { isSecret: true } } } }
          }
        ]
      }
    });
    expect(result.results[0].effectiveConfig).toHaveProperty('documentParse.customPdf.key', '');
    const stored = await MongoSystemInstanceConfig.findOne({ domain: 'providers' }).lean();
    expect(stored?.overrides).not.toHaveProperty('documentParse.customPdf.key');
    expect(stored?.explicitDefaultPaths ?? []).not.toContain('documentParse.customPdf.key');
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

  it('persists performance tracking retentionHours directly without modifying log TTL indexes', async () => {
    const updated = await callUpdate({
      body: {
        items: [
          {
            domain: 'performance',
            expectedRevision: 0,
            overrides: { chat: { maxQpm: 3000 }, tracking: { retentionHours: 48 } }
          }
        ]
      }
    } as any);

    expect(updated.results[0].revision).toBe(1);
    expect(mocks.initSystemConfig).toHaveBeenLastCalledWith();
    expect(await MongoSystemInstanceConfig.findOne({ domain: 'performance' }).lean()).toMatchObject(
      {
        revision: 1,
        overrides: { chat: { maxQpm: 3000 }, tracking: { retentionHours: 48 } }
      }
    );
  });

  it('requires explicitly replacing or clearing stored document parse credentials when their target URL changes', async () => {
    // 1. 初始保存三类可配置地址及对应密钥
    const init = await callUpdate({
      body: {
        items: [
          {
            domain: 'providers',
            expectedRevision: 0,
            overrides: {
              documentParse: {
                provider: 'somark',
                customPdf: {
                  somarkBaseUrl: 'https://somark.ai/api/v1',
                  somarkApiKey: 'sk-somark-global',
                  url: 'https://custom-a.example.com/v2/parse/file',
                  key: 'sk-custom-a'
                },
                sangfor: {
                  url: 'https://sangfor-a.example.com/parse',
                  key: 'sk-sangfor-a'
                }
              }
            }
          }
        ]
      }
    } as any);
    expect(init.results[0].revision).toBe(1);

    // 2. 地址未实质变化（含尾斜杠归一化）且保留旧密钥时允许保存其他字段
    const sameEndpoint = await callUpdate({
      body: {
        items: [
          {
            domain: 'providers',
            expectedRevision: 1,
            overrides: {
              documentParse: {
                customPdf: {
                  somarkBaseUrl: 'https://somark.ai/api/v1/',
                  somarkApiKey: { isSecret: true },
                  timeoutSeconds: 900
                }
              }
            }
          }
        ]
      }
    } as any);
    expect(sameEndpoint.results[0].revision).toBe(2);

    // 3. 分别修改 SoMark / 自建 / 深信服地址但保留旧密钥标记（或省略密钥）时，全部拒绝且不写库
    for (const [overrides, expectedPath] of [
      [
        {
          documentParse: {
            customPdf: {
              somarkBaseUrl: 'https://somark.cn/api/v1',
              somarkApiKey: { isSecret: true }
            }
          }
        },
        ['providers', 'documentParse', 'customPdf', 'somarkApiKey']
      ],
      [
        {
          documentParse: {
            customPdf: {
              url: 'https://custom-b.example.com/v2/parse/file',
              key: { isSecret: true }
            }
          }
        },
        ['providers', 'documentParse', 'customPdf', 'key']
      ],
      [
        {
          documentParse: {
            sangfor: {
              url: 'https://sangfor-b.example.com/parse'
            }
          }
        },
        ['providers', 'documentParse', 'sangfor', 'key']
      ]
    ] as const) {
      await expect(
        callUpdate({
          body: {
            items: [{ domain: 'providers', expectedRevision: 2, overrides }]
          }
        } as any)
      ).rejects.toSatisfy((error: unknown) => {
        expect(error).toBeInstanceOf(ApiRequestInputParseError);
        const issues = (error as ApiRequestInputParseError).cause.issues;
        expect(issues[0]?.path).toEqual(expectedPath);
        return true;
      });
    }
    expect(
      (await MongoSystemInstanceConfig.findOne({ domain: 'providers' }).lean())?.revision
    ).toBe(2);

    // 4. 改地址同时显式替换或清空对应密钥时允许保存
    const updated = await callUpdate({
      body: {
        items: [
          {
            domain: 'providers',
            expectedRevision: 2,
            overrides: {
              documentParse: {
                customPdf: {
                  somarkBaseUrl: 'https://somark.cn/api/v1',
                  somarkApiKey: 'sk-somark-cn',
                  url: 'https://custom-b.example.com/v2/parse/file',
                  key: ''
                },
                sangfor: {
                  url: 'https://sangfor-b.example.com/parse',
                  key: 'sk-sangfor-b'
                }
              }
            }
          }
        ]
      }
    } as any);
    expect(updated.results[0].revision).toBe(3);
  });

  it.each([
    { legacyHours: 0, clampedHours: 1 },
    { legacyHours: 1440, clampedHours: 1000 }
  ])(
    'clamps legacy and explicit out-of-range retentionHours=$legacyHours to $clampedHours via schema catch',
    async ({ legacyHours, clampedHours }) => {
      // 模拟升级前库中可能残留的越界旧值（如 0 或 1440）。
      await MongoSystemInstanceConfig.collection.insertOne({
        domain: 'performance',
        schemaVersion: 1,
        revision: 3,
        overrides: { tracking: { retentionHours: legacyHours } },
        updatedAt: new Date()
      });

      // 未显式提交 retentionHours 时保存同域其他字段不被历史越界值阻断，经 Zod catch 自动就近收口。
      const saved = await callUpdate({
        body: {
          items: [
            {
              domain: 'performance',
              expectedRevision: 3,
              overrides: { chat: { maxQpm: 2500 } }
            }
          ]
        }
      } as any);

      expect(saved.results[0].revision).toBe(4);
      expect(saved.results[0].effectiveConfig).toMatchObject({
        chat: { maxQpm: 2500 },
        tracking: { retentionHours: clampedHours }
      });

      // 显式提交越界值同样由 Zod catch 就近收口到 [1, 1000]。
      const explicit = await callUpdate({
        body: {
          items: [
            {
              domain: 'performance',
              expectedRevision: 4,
              overrides: { tracking: { retentionHours: legacyHours } }
            }
          ]
        }
      } as any);
      expect(explicit.results[0].revision).toBe(5);
      expect(explicit.results[0].effectiveConfig).toMatchObject({
        tracking: { retentionHours: clampedHours }
      });
    }
  );
});
