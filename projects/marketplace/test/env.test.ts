import { afterEach, describe, expect, it, vi } from 'vitest';

const originalCommunityAuthToken = process.env.COMMUNITY_AUTH_TOKEN;

const importEnv = async () => {
  vi.resetModules();
  return import('../src/env');
};

describe('marketplace env', () => {
  afterEach(() => {
    vi.stubEnv('COMMUNITY_AUTH_TOKEN', originalCommunityAuthToken);
  });

  it('parses optional community auth token', async () => {
    vi.stubEnv('COMMUNITY_AUTH_TOKEN', 'community-token');

    const { marketplaceEnv } = await importEnv();

    expect(marketplaceEnv.COMMUNITY_AUTH_TOKEN).toBe('community-token');
  });
});
