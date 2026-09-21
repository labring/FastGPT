import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createSystemChannel: vi.fn(),
  listAllSystemChannels: vi.fn(),
  findMongoModels: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/channel', () => ({
  createSystemChannel: mocks.createSystemChannel,
  listAllSystemChannels: mocks.listAllSystemChannels
}));

vi.mock('@fastgpt/service/core/ai/config/schema', () => ({
  MongoAIModel: {
    find: mocks.findMongoModels
  }
}));

import { migrateLegacyChannelConfigsService } from '@/migration/tasks/4171/20260928_migrate_legacy_channel_configs/service';

describe('migrateLegacyChannelConfigsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns zero counts when no models have legacy requestUrl or requestAuth', async () => {
    mocks.findMongoModels.mockReturnValue({
      lean: vi.fn().mockResolvedValue([])
    });

    const res = await migrateLegacyChannelConfigsService();
    expect(res).toEqual({ scannedCount: 0, migratedCount: 0, skippedCount: 0 });
    expect(mocks.createSystemChannel).not.toHaveBeenCalled();
  });

  it('migrates legacy configs and skips existing channels idempotently', async () => {
    mocks.findMongoModels.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { model: 'gpt-4o', requestUrl: 'https://api.openai.com/v1', requestAuth: 'sk-123' },
        { model: 'claude-3-5', requestUrl: 'https://api.anthropic.com', requestAuth: 'sk-456' },
        { model: 'gpt-4o', requestUrl: 'https://api.openai.com/v1', requestAuth: 'sk-123' } // duplicate
      ])
    });

    // claude-3-5 already exists as a migrated channel
    mocks.listAllSystemChannels.mockResolvedValue([
      { id: 1, name: 'Migrated: claude-3-5', models: ['claude-3-5'] }
    ]);
    mocks.createSystemChannel.mockResolvedValue(undefined);

    const assertActive = vi.fn().mockResolvedValue(undefined);
    const res = await migrateLegacyChannelConfigsService({ assertActive });

    expect(res).toEqual({
      scannedCount: 3,
      migratedCount: 1,
      skippedCount: 1
    });

    expect(mocks.createSystemChannel).toHaveBeenCalledTimes(1);
    expect(mocks.createSystemChannel).toHaveBeenCalledWith({
      name: 'Migrated: gpt-4o',
      type: 1,
      key: 'sk-123',
      base_url: 'https://api.openai.com/v1',
      models: ['gpt-4o'],
      priority: 1,
      status: 1
    });
    expect(assertActive).toHaveBeenCalled();
  });
});
