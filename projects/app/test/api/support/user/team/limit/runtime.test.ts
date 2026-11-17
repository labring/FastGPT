import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';

const fixture = vi.hoisted(() => ({
  last: new Map<string, Date>(),
  findOne: vi.fn(),
  update: vi.fn()
}));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDataset: async () => ({
    teamId: 'team-owned',
    tmbId: 'member-owned',
    dataset: { name: 'owned', type: 'dataset' }
  })
}));
vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: async () => ({ teamId: 'team-owned' })
}));
vi.mock('@fastgpt/service/support/user/team/teamSchema', () => ({
  MongoTeam: { findOne: fixture.findOne, findByIdAndUpdate: fixture.update }
}));
vi.mock('@fastgpt/service/support/user/team/utils', () => ({ getTeamMemberMap: vi.fn() }));
vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: vi.fn(),
  getI18nDatasetType: vi.fn()
}));

import exportLimit from '@/pages/api/support/user/team/limit/exportDatasetLimit';
import syncLimit from '@/pages/api/support/user/team/limit/webSyncLimit';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2030-01-01T12:00:00Z'));
  vi.clearAllMocks();
  fixture.last.clear();
  vi.stubGlobal('systemInstanceConfig', resolveSystemInstanceConfig({}));
  // 内存模型仅解释本消费者的存在性/$lte 查询，时间阈值由真实生产函数生成。
  fixture.findOne.mockImplementation(async (query) => {
    const [missing, comparison] = query.$or;
    const field = Object.keys(missing)[0];
    const last = fixture.last.get(field);
    return !last || last <= comparison[field].$lte ? { _id: 'team-owned' } : null;
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('team cooldown APIs consume current resource configuration', () => {
  it.each([
    ['exportDatasetLimitMinutes', 'limit.lastExportDatasetTime', exportLimit],
    ['websiteSyncLimitMinuted', 'limit.lastWebsiteSyncTime', syncLimit]
  ] as const)(
    '%s drives the real check, including zero and the inclusive cooldown boundary',
    async (field, timestamp, handler) => {
      const req = { query: { datasetId: 'owned-dataset' }, headers: {} } as never;
      const resource = global.systemInstanceConfig!.resource;
      for (const minutes of [0, 2, 5]) {
        resource[field] = minutes;
        fixture.last.set(timestamp, new Date(Date.now() - 60_000));
        if (minutes === 0) await expect(handler(req, {} as never)).resolves.toBeUndefined();
        else await expect(handler(req, {} as never)).rejects.toContain(`${minutes} 分钟`);
        const query = fixture.findOne.mock.calls.at(-1)![0];
        expect(query._id).toBe('team-owned');
        expect(query.$or[1][timestamp].$lte.getTime()).toBe(Date.now() - minutes * 60_000);

        fixture.last.set(timestamp, new Date(Date.now() - minutes * 60_000));
        await expect(handler(req, {} as never)).resolves.toBeUndefined();
        fixture.last.set(timestamp, new Date(Date.now() - minutes * 60_000 + 1));
        await expect(handler(req, {} as never)).rejects.toContain(`${minutes} 分钟`);
      }
      expect(fixture.update).not.toHaveBeenCalled();
    }
  );
});
