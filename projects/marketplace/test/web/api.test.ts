import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getDownloadURL,
  getMarketplaceToolDetail,
  getMarketplaceToolVersions,
  getMarketplaceTools,
  getToolTags
} from '../../src/web/api';

const fetchMock = vi.fn();

const mockJsonResponse = (data: unknown) => ({
  json: vi.fn().mockResolvedValue({ code: 200, data })
});

describe('marketplace web api', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts marketplace tool list filters as JSON', async () => {
    const response = { list: [], total: 0 };
    fetchMock.mockResolvedValueOnce(mockJsonResponse(response));

    await expect(
      getMarketplaceTools({ pageNum: 2, pageSize: 10, searchKey: 'weather', tags: ['tools'] })
    ).resolves.toBe(response);

    expect(fetchMock).toHaveBeenCalledWith('api/tool/list', {
      method: 'POST',
      body: JSON.stringify({
        pageNum: 2,
        pageSize: 10,
        searchKey: 'weather',
        tags: ['tools']
      }),
      headers: { 'Content-Type': 'application/json' }
    });
  });

  it('encodes detail toolId and optional version in query string', async () => {
    const detail = { tools: [] };
    fetchMock.mockResolvedValueOnce(mockJsonResponse(detail));

    await expect(
      getMarketplaceToolDetail({ toolId: 'tool/set child', version: '1.2.3-beta' })
    ).resolves.toBe(detail);

    expect(fetchMock).toHaveBeenCalledWith(
      'api/tool/detail?toolId=tool%2Fset+child&version=1.2.3-beta',
      { method: 'GET' }
    );
  });

  it('omits empty version query for detail', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ tools: [] }));

    await getMarketplaceToolDetail({ toolId: 'tool-a' });

    expect(fetchMock).toHaveBeenCalledWith('api/tool/detail?toolId=tool-a', { method: 'GET' });
  });

  it('fetches versions with optional toolId', async () => {
    const versions = [{ toolId: 'tool-a', version: '2.0.0', etag: 'etag-2' }];
    fetchMock.mockResolvedValueOnce(mockJsonResponse(versions));

    await expect(getMarketplaceToolVersions('tool-a')).resolves.toBe(versions);

    expect(fetchMock).toHaveBeenCalledWith('api/tool/versions?toolId=tool-a', { method: 'GET' });
  });

  it('fetches all versions when toolId is not provided', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse([]));

    await getMarketplaceToolVersions();

    expect(fetchMock).toHaveBeenCalledWith('api/tool/versions', { method: 'GET' });
  });

  it('fetches download URL for the selected version', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse('https://cdn.example.com/pkg.pkg'));

    await expect(getDownloadURL('tool-a', '1.0.1')).resolves.toBe(
      'https://cdn.example.com/pkg.pkg'
    );

    expect(fetchMock).toHaveBeenCalledWith('api/tool/getDownloadUrl?toolId=tool-a&version=1.0.1', {
      method: 'GET'
    });
  });

  it('fetches system tags', async () => {
    const tags = [{ tagId: 'search', tagName: 'Search', isSystem: true, tagOrder: 0 }];
    fetchMock.mockResolvedValueOnce(mockJsonResponse(tags));

    await expect(getToolTags()).resolves.toBe(tags);

    expect(fetchMock).toHaveBeenCalledWith('api/tool/tags', { method: 'GET' });
  });
});
