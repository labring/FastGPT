import { afterEach, describe, expect, it, vi } from 'vitest';

const originalSyncIndex = process.env.SYNC_INDEX;
const originalCommunityAuthToken = process.env.COMMUNITY_AUTH_TOKEN;

const importEnv = async () => {
  vi.resetModules();
  return import('../src/env');
};

describe('marketplace env', () => {
  afterEach(() => {
    vi.stubEnv('SYNC_INDEX', originalSyncIndex);
    vi.stubEnv('COMMUNITY_AUTH_TOKEN', originalCommunityAuthToken);
  });

  it('defaults SYNC_INDEX to true when it is not configured', async () => {
    vi.stubEnv('SYNC_INDEX', undefined);

    const { marketplaceEnv } = await importEnv();

    expect(marketplaceEnv.SYNC_INDEX).toBe(true);
  });

  it('defaults SYNC_INDEX to true when it is empty', async () => {
    vi.stubEnv('SYNC_INDEX', '');

    const { marketplaceEnv } = await importEnv();

    expect(marketplaceEnv.SYNC_INDEX).toBe(true);
  });

  it('parses explicit false-like SYNC_INDEX values', async () => {
    vi.stubEnv('SYNC_INDEX', 'false');

    const { marketplaceEnv } = await importEnv();

    expect(marketplaceEnv.SYNC_INDEX).toBe(false);
  });

  it('parses optional community auth token', async () => {
    vi.stubEnv('COMMUNITY_AUTH_TOKEN', 'community-token');

    const { marketplaceEnv } = await importEnv();

    expect(marketplaceEnv.COMMUNITY_AUTH_TOKEN).toBe('community-token');
  });
});
