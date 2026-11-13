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

  it.each([undefined, 'false', 'invalid'])('ignores retired SYNC_INDEX=%s', async (value) => {
    vi.stubEnv('SYNC_INDEX', value);
    const { marketplaceEnv } = await importEnv();
    expect('SYNC_INDEX' in marketplaceEnv).toBe(false);
  });

  it('parses optional community auth token', async () => {
    vi.stubEnv('COMMUNITY_AUTH_TOKEN', 'community-token');

    const { marketplaceEnv } = await importEnv();

    expect(marketplaceEnv.COMMUNITY_AUTH_TOKEN).toBe('community-token');
  });
});
