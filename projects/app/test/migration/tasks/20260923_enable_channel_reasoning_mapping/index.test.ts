import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import { REASONING_FIELD_MAPPING_CHANNEL_TYPES } from '@fastgpt/global/core/ai/channel';
import type { SystemMigrationContext } from '@/migration/registry';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ mergeAIProxyChannelConfigs: vi.fn() }));

vi.mock('@/migration/tasks/20260923_enable_channel_reasoning_mapping/service', () => ({
  mergeAIProxyChannelConfigs: mocks.mergeAIProxyChannelConfigs
}));

import { enableChannelReasoningMapping } from '@/migration/tasks/20260923_enable_channel_reasoning_mapping';

const createContext = () => {
  const progress: Array<{
    key: string;
    status: SystemMigrationStatusEnum;
    current?: number;
    total?: number;
  }> = [];
  const context = {
    migrationId: '20260923_enable_channel_reasoning_mapping',
    runId: 'test-run',
    signal: new AbortController().signal,
    getCheckpoint: vi.fn(),
    getFailedRecords: vi.fn(),
    reportFailedRecords: vi.fn(),
    saveCheckpoint: vi.fn(),
    reportProgress: vi.fn(
      async (value: {
        key: string;
        status: SystemMigrationStatusEnum;
        current?: number;
        total?: number;
      }) => {
        progress.push(value);
      }
    ),
    assertActive: vi.fn(async () => undefined),
    fail: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  } satisfies SystemMigrationContext;

  return { context, progress };
};

describe('enableChannelReasoningMapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mergeAIProxyChannelConfigs.mockResolvedValue({ channelCount: 5, updatedCount: 3 });
  });

  it('sets the config for compatible channels and completes progress after validation', async () => {
    const { context, progress } = createContext();

    await expect(enableChannelReasoningMapping(context)).resolves.toEqual({
      channelCount: 5,
      updatedCount: 3
    });

    expect(mocks.mergeAIProxyChannelConfigs).toHaveBeenCalledWith({
      channelTypes: REASONING_FIELD_MAPPING_CHANNEL_TYPES,
      configPatch: { map_reasoning_to_reasoning_content: true },
      beforeUpdate: context.assertActive
    });
    expect(context.assertActive).toHaveBeenCalledTimes(2);
    expect(progress).toEqual([
      { key: 'channels', status: SystemMigrationStatusEnum.running },
      {
        key: 'channels',
        status: SystemMigrationStatusEnum.succeeded,
        current: 5,
        total: 5
      }
    ]);
  });

  it('does not report success when the external update fails', async () => {
    mocks.mergeAIProxyChannelConfigs.mockRejectedValueOnce(new Error('AI Proxy unavailable'));
    const { context, progress } = createContext();

    await expect(enableChannelReasoningMapping(context)).rejects.toThrow('AI Proxy unavailable');
    expect(progress).toEqual([{ key: 'channels', status: SystemMigrationStatusEnum.running }]);
  });
});
