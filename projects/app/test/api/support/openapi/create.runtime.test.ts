import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';

const fixture = vi.hoisted(() => ({
  records: [] as Record<string, any>[],
  authorized: true,
  touched: [] as string[]
}));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/user/lock', () => ({ withTeamLock: vi.fn() }));
vi.mock('@fastgpt/service/support/permission/auth/common', () => ({ parseHeaderCert: vi.fn() }));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authUserPer: async () => {
    if (!fixture.authorized) throw ERROR_ENUM.unAuthorization;
    return { teamId: 'team-owned', tmbId: 'member-owned', permission: { isOwner: true } };
  }
}));
vi.mock('@fastgpt/service/support/permission/app/auth', () => ({ authAppByTmbId: vi.fn() }));
vi.mock('@fastgpt/service/support/openapi/schema', () => ({
  MongoOpenApi: {
    countDocuments: async () => fixture.records.length,
    create: async (input: Record<string, unknown>) => {
      const record = { ...input, _id: `owned-key-${fixture.records.length}`, usagePoints: 0 };
      fixture.records.push(record);
      return record;
    },
    findOne: ({ apiKey }: { apiKey: string }) => ({
      lean: async () => fixture.records.find((record) => record.apiKey === apiKey) ?? null
    }),
    findByIdAndUpdate: async (id: string) => {
      fixture.touched.push(id);
    }
  }
}));
vi.mock('@fastgpt/service/core/app/schema', () => ({ MongoApp: {} }));
vi.mock('@fastgpt/service/support/user/team/teamSchema', () => ({ MongoTeam: {} }));
vi.mock('@fastgpt/service/support/user/team/teamMemberSchema', () => ({ MongoTeamMember: {} }));
vi.mock('@fastgpt/service/support/user/audit/util', () => ({ addAuditLog: vi.fn() }));
vi.mock('@fastgpt/service/support/openapi/tag/service', () => ({ validateOpenApiTags: vi.fn() }));

import { handler } from '@/pages/api/support/openapi/create';
import { authOpenApiKey } from '@fastgpt/service/support/openapi/auth';

beforeEach(() => {
  fixture.records.length = 0;
  fixture.touched.length = 0;
  fixture.authorized = true;
  vi.stubGlobal('systemInstanceConfig', resolveSystemInstanceConfig({}));
});
afterEach(() => vi.unstubAllGlobals());

describe('API key prefix runtime consumer', () => {
  it('creates and authenticates A/B and default prefixes without invalidating previously issued credentials', async () => {
    const keys: string[] = [];
    for (const prefix of ['owned-prefix-a', 'owned-prefix-b', '   ']) {
      global.systemInstanceConfig!.site.openApiPrefix = prefix;
      const key = await handler({
        body: { name: 'owned runtime key' },
        headers: {},
        query: {}
      } as never);
      expect(key.startsWith(`${prefix.trim() || 'fastgpt'}-`)).toBe(true);
      expect(fixture.records.at(-1)?.apiKey === key).toBe(true);
      keys.push(key);
      for (const issued of keys) {
        const auth = await authOpenApiKey({ apikey: issued });
        expect(auth.teamId).toBe('team-owned');
        expect(auth.tmbId).toBe('member-owned');
        expect(auth.apiKeyType).toBe('personal');
        expect(auth.apikey === issued).toBe(true);
      }
    }
    expect(new Set(keys).size).toBe(3);
    expect(fixture.touched).toHaveLength(6);
    await expect(authOpenApiKey({ apikey: `${keys[0]}-forged` })).rejects.toBe(
      ERROR_ENUM.unAuthApiKey
    );
  });

  it('does not create a credential when the real create handler is denied by its permission boundary', async () => {
    fixture.authorized = false;
    await expect(
      handler({ body: { name: 'denied key' }, headers: {}, query: {} } as never)
    ).rejects.toBe(ERROR_ENUM.unAuthorization);
    expect(fixture.records).toHaveLength(0);
  });
});
