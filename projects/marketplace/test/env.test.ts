import { afterEach, describe, expect, it, vi } from 'vitest';

const originalSyncIndex = process.env.SYNC_INDEX;

const importEnv = async () => {
  vi.resetModules();
  return import('../src/env');
};

describe('marketplace env', () => {
  afterEach(() => {
    vi.stubEnv('SYNC_INDEX', originalSyncIndex);
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
});
