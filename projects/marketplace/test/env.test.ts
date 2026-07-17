import { afterEach, describe, expect, it, vi } from 'vitest';

const originalCommunityAuthToken = process.env.COMMUNITY_AUTH_TOKEN;
const originalMongoIndexSyncMode = process.env.MONGO_INDEX_SYNC_MODE;

const importEnv = async () => {
  vi.resetModules();
  return import('../src/env');
};

describe('marketplace env', () => {
  afterEach(() => {
    vi.stubEnv('COMMUNITY_AUTH_TOKEN', originalCommunityAuthToken);
    vi.stubEnv('MONGO_INDEX_SYNC_MODE', originalMongoIndexSyncMode);
  });

  it('defaults MONGO_INDEX_SYNC_MODE to create when it is not configured', async () => {
    vi.stubEnv('MONGO_INDEX_SYNC_MODE', undefined);

    const { marketplaceEnv } = await importEnv();

    expect(marketplaceEnv.MONGO_INDEX_SYNC_MODE).toBe('create');
  });

  it('defaults MONGO_INDEX_SYNC_MODE to create when it is empty', async () => {
    vi.stubEnv('MONGO_INDEX_SYNC_MODE', '');

    const { marketplaceEnv } = await importEnv();

    expect(marketplaceEnv.MONGO_INDEX_SYNC_MODE).toBe('create');
  });

  it('parses explicit MONGO_INDEX_SYNC_MODE values', async () => {
    vi.stubEnv('MONGO_INDEX_SYNC_MODE', 'off');

    const { marketplaceEnv } = await importEnv();

    expect(marketplaceEnv.MONGO_INDEX_SYNC_MODE).toBe('off');
  });

  it('parses destructive MongoDB index sync mode', async () => {
    vi.stubEnv('MONGO_INDEX_SYNC_MODE', 'sync');

    const { marketplaceEnv } = await importEnv();

    expect(marketplaceEnv.MONGO_INDEX_SYNC_MODE).toBe('sync');
  });

  it('rejects invalid MONGO_INDEX_SYNC_MODE values', async () => {
    vi.stubEnv('MONGO_INDEX_SYNC_MODE', 'full');

    await expect(importEnv()).rejects.toThrow('Invalid marketplace environment variables');
  });

  it('parses optional community auth token', async () => {
    vi.stubEnv('COMMUNITY_AUTH_TOKEN', 'community-token');

    const { marketplaceEnv } = await importEnv();

    expect(marketplaceEnv.COMMUNITY_AUTH_TOKEN).toBe('community-token');
  });
});
