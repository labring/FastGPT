import { afterEach, describe, expect, it, vi } from 'vitest';

const originalCommunityAuthToken = process.env.COMMUNITY_AUTH_TOKEN;
const originalSyncIndex = process.env.SYNC_INDEX;

const importEnv = async () => {
  vi.resetModules();
  return import('../src/env');
};

describe('marketplace env', () => {
  afterEach(() => {
    vi.stubEnv('COMMUNITY_AUTH_TOKEN', originalCommunityAuthToken);
    vi.stubEnv('SYNC_INDEX', originalSyncIndex);
  });

  it('enables MongoDB index synchronization by default and supports disabling it', async () => {
    vi.stubEnv('SYNC_INDEX', undefined);
    await expect(importEnv()).resolves.toMatchObject({
      marketplaceEnv: { SYNC_INDEX: true }
    });

    vi.stubEnv('SYNC_INDEX', 'false');
    await expect(importEnv()).resolves.toMatchObject({
      marketplaceEnv: { SYNC_INDEX: false }
    });
  });

  it('parses optional community auth token', async () => {
    vi.stubEnv('COMMUNITY_AUTH_TOKEN', 'community-token');

    const { marketplaceEnv } = await importEnv();

    expect(marketplaceEnv.COMMUNITY_AUTH_TOKEN).toBe('community-token');
  });
});
