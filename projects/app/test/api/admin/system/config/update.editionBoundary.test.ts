import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import type { UpdateDomainConfigBody } from '@fastgpt/global/openapi/admin/system/instanceConfig/api';

const mocks = vi.hoisted(() => ({
  edition: 'community' as 'community' | 'pro',
  save: vi.fn(),
  readSite: vi.fn(),
  init: vi.fn()
}));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: async () => ({ userId: 'root' })
}));
// 保留真实请求 Schema 和 parseApiInput；只隔离持久化、运行时刷新及外部资源。
vi.mock('@fastgpt/service/common/system/systemInstanceConfig/controller', () => ({
  getServiceEdition: () => mocks.edition,
  findOverridesNotAllowedByEdition: () => [],
  getDomainConfig: mocks.readSite,
  batchUpdateDomainConfigs: mocks.save,
  formatDomainConfigForAdmin: (result: unknown) => result
}));
vi.mock('@/service/common/system', () => ({ initSystemConfig: mocks.init }));
vi.mock('@/service/common/system/syncSiteAvatarLifecycle', () => ({
  syncSiteAvatarLifecycle: vi.fn()
}));
vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => ({ error: vi.fn() }),
  LogCategories: { SYSTEM: 'system' }
}));
vi.mock('@fastgpt/service/common/system/migrationCoverageLog', () => ({
  logInstanceConfigWrite: vi.fn()
}));
vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: vi.fn().mockResolvedValue(undefined)
}));

import handler from '@/pages/api/admin/system/config/update';

const request = (body: UpdateDomainConfigBody) =>
  ({ body }) as ApiRequestProps<UpdateDomainConfigBody>;
const callUpdate = (body: UpdateDomainConfigBody) => handler(request(body), {} as ApiResponseType);

describe('instance config update: plan edition boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.edition = 'community';
    mocks.save.mockResolvedValue([]);
    mocks.init.mockResolvedValue(undefined);
  });

  it.each([{}, { extraDatasetSizePrice: 5 }])(
    'rejects community subPlans before any read or write, including %j',
    async (subPlans) => {
      await expect(
        callUpdate({
          items: [{ domain: 'site', expectedRevision: 1, overrides: { name: 'Do not save' } }],
          subPlans,
          subPlansExpectedRevision: 0
        })
      ).rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('subPlans') });
      expect(mocks.readSite).not.toHaveBeenCalled();
      expect(mocks.save).not.toHaveBeenCalled();
      expect(mocks.init).not.toHaveBeenCalled();
    }
  );

  it('keeps ordinary community configuration updates available when subPlans is omitted', async () => {
    const items = [
      { domain: 'feature' as const, expectedRevision: 1, overrides: { enableTeamModel: true } }
    ];
    await expect(callUpdate({ items })).resolves.toEqual({ results: [] });
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({
      items,
      subPlans: undefined,
      subPlansExpectedRevision: undefined,
      actor: { actor: 'admin', userId: 'root' }
    });
  });

  it.each([{}, { extraDatasetSizePrice: 5 }])(
    'passes commercial plans and domains to the same save operation: %j',
    async (subPlans) => {
      mocks.edition = 'pro';
      const items = [{ domain: 'commercial' as const, expectedRevision: 2, overrides: {} }];
      await expect(callUpdate({ items, subPlans, subPlansExpectedRevision: 2 })).resolves.toEqual({
        results: []
      });
      expect(mocks.save).toHaveBeenCalledExactlyOnceWith({
        items,
        subPlans,
        subPlansExpectedRevision: 2,
        actor: { actor: 'admin', userId: 'root' }
      });
    }
  );
});
