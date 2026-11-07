import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_INSTANCE_CONFIG_DOMAINS } from '@fastgpt/global/common/system/config/schema';

const mocks = vi.hoisted(() => ({
  instanceFindLean: vi.fn(),
  fastgptFindOneLean: vi.fn(),
  proFindOneLean: vi.fn()
}));

vi.mock('@fastgpt/service/common/system/systemInstanceConfig/schema', () => ({
  MongoSystemInstanceConfig: {
    find: vi.fn(() => ({ lean: mocks.instanceFindLean }))
  }
}));

vi.mock('@fastgpt/service/common/system/config/schema', () => ({
  MongoSystemConfigs: {
    findOne: vi.fn((filter: { type?: string }) => ({
      sort: vi.fn(() => ({
        lean: filter?.type === 'fastgptPro' ? mocks.proFindOneLean : mocks.fastgptFindOneLean
      }))
    }))
  }
}));

import { inspectInstanceConfigMigration } from '@/migration/tasks/4180/20260928_migrate_instance_configs/service';

describe('inspectInstanceConfigMigration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fastgptFindOneLean.mockResolvedValue({
      value: { feConfigs: {}, systemEnv: {} }
    });
    mocks.proFindOneLean.mockResolvedValue(null);
  });

  it('counts a default-only domain as missing so the entry creates all 11 domains', async () => {
    // feature 没有任何 legacy overrides，但 applyInstanceConfigMigration 仍必须写入空默认域。
    // 完成条件若只统计"有非默认 overrides 的域"，这里会被误判为已完成并直接 skipped。
    mocks.instanceFindLean.mockResolvedValue(
      SYSTEM_INSTANCE_CONFIG_DOMAINS.filter((domain) => domain !== 'feature').map((domain) => ({
        domain,
        revision: 1,
        overrides: {},
        explicitDefaultPaths: []
      }))
    );

    const result = await inspectInstanceConfigMigration();

    expect(result.existingDomainCount).toBe(10);
    expect(result.missingDomainCount).toBe(1);
  });
});
