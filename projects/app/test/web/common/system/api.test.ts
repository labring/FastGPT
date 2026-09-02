import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestMocks = vi.hoisted(() => ({ GET: vi.fn() }));

vi.mock('@/web/common/api/request', () => ({
  GET: requestMocks.GET,
  POST: vi.fn(),
  PUT: vi.fn(),
  DELETE: vi.fn()
}));

import { getUserModelCatalog } from '@/web/common/system/api';

describe('getUserModelCatalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('serializes outlink auth as one JSON query field', () => {
    const outLinkAuthData = { shareId: 'share-id', outLinkUid: 'outlink-user' };

    getUserModelCatalog({ version: 'version-1', outLinkAuthData });

    expect(requestMocks.GET).toHaveBeenCalledWith(
      '/core/ai/model/catalog',
      {
        version: 'version-1',
        outLinkAuthData: JSON.stringify(outLinkAuthData)
      },
      { deduplicate: true }
    );
  });

  it('omits outlink auth for a logged-in member request', () => {
    getUserModelCatalog({ version: 'version-1' });

    expect(requestMocks.GET).toHaveBeenCalledWith(
      '/core/ai/model/catalog',
      { version: 'version-1', outLinkAuthData: undefined },
      { deduplicate: true }
    );
  });
});
