import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';

import * as api from '@/web/core/plugin/marketplace/api';
import type {
  GetMarketplaceToolsBodyType,
  MarketplaceToolListItemType,
  GetMarketplaceToolDetailQueryType,
  GetMarketplaceToolDetailResponseType,
  GetMarketplaceToolTagsResponseType,
  GetSystemInstalledPluginsQueryType,
  GetSystemInstalledPluginsResponseType
} from '@fastgpt/global/openapi/core/plugin/marketplace/api';
import type { PaginationResponse } from '@fastgpt/web/common/fetch/type';

// Patch for Vitest: If your test runner does not resolve @ aliases, you may need to adjust your config or use relative paths.
// For this test file, we will fallback to relative import if needed.
let GET: typeof import('@/web/common/api/request').GET;
let POST: typeof import('@/web/common/api/request').POST;

vi.mock('@/web/common/api/request', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/web/common/api/request')>();
  return {
    ...actual,
    GET: vi.fn(),
    POST: vi.fn()
  };
});

beforeAll(async () => {
  // @ts-ignore
  ({ GET, POST } = await import('@/web/common/api/request'));
});

describe('marketplace/api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSystemInstalledPlugins', () => {
    it('should call GET with correct params and return value', async () => {
      const query: GetSystemInstalledPluginsQueryType = { page: 1, pageSize: 10 };
      const mockResponse: GetSystemInstalledPluginsResponseType = {
        data: [],
        total: 0,
        page: 1,
        pageSize: 10
      };
      vi.mocked(GET).mockResolvedValueOnce(mockResponse);

      const result = await api.getSystemInstalledPlugins(query);
      expect(GET).toHaveBeenCalledWith('/core/plugin/admin/marketplace/installed', query);
      expect(result).toBe(mockResponse);
    });
  });

  describe('getMarketplaceTools', () => {
    it('should call POST with correct params and return value', async () => {
      const data: GetMarketplaceToolsBodyType = { page: 1, pageSize: 10 };
      const mockResponse: PaginationResponse<MarketplaceToolListItemType> = {
        data: [],
        total: 0,
        page: 1,
        pageSize: 10
      };
      vi.mocked(POST).mockResolvedValueOnce(mockResponse);

      const result = await api.getMarketplaceTools(data);
      expect(POST).toHaveBeenCalledWith('/marketplace/api/tool/list', data);
      expect(result).toBe(mockResponse);
    });
  });

  describe('getMarketplaceToolDetail', () => {
    it('should call GET with correct params and return value', async () => {
      const data: GetMarketplaceToolDetailQueryType = { toolId: 'abc123' };
      const mockResponse: GetMarketplaceToolDetailResponseType = {
        toolId: 'abc123',
        name: 'TestTool',
        description: 'desc',
        version: '1.0.0',
        tags: [],
        author: 'author',
        homepage: '',
        icon: '',
        readme: '',
        downloadUrl: '',
        installed: false
      };
      vi.mocked(GET).mockResolvedValueOnce(mockResponse);

      const result = await api.getMarketplaceToolDetail(data);
      expect(GET).toHaveBeenCalledWith('/marketplace/api/tool/detail', data);
      expect(result).toBe(mockResponse);
    });
  });

  describe('getMarketPlaceToolTags', () => {
    it('should call GET with correct params and return value', async () => {
      const mockResponse: GetMarketplaceToolTagsResponseType = {
        tags: ['tag1', 'tag2']
      };
      vi.mocked(GET).mockResolvedValueOnce(mockResponse);

      const result = await api.getMarketPlaceToolTags();
      expect(GET).toHaveBeenCalledWith('/marketplace/api/tool/tags');
      expect(result).toBe(mockResponse);
    });
  });

  describe('getMarketplaceDownloadURL', () => {
    it('should call GET with correct params and return value', async () => {
      const toolId = 'tool-xyz';
      const url = 'https://download.url/tool-xyz.zip';
      vi.mocked(GET).mockResolvedValueOnce(url);

      const result = await api.getMarketplaceDownloadURL(toolId);
      expect(GET).toHaveBeenCalledWith('/marketplace/api/tool/getDownloadUrl', { toolId });
      expect(result).toBe(url);
    });
  });

  describe('getMarketplaceDownloadURLs', () => {
    it('should call POST with correct params and return value', async () => {
      const toolIds = ['id1', 'id2'];
      const urls = ['https://download.url/id1.zip', 'https://download.url/id2.zip'];
      vi.mocked(POST).mockResolvedValueOnce(urls);

      const result = await api.getMarketplaceDownloadURLs(toolIds);
      expect(POST).toHaveBeenCalledWith('/marketplace/api/tool/getDownloadUrl', { toolIds });
      expect(result).toBe(urls);
    });
  });

  describe('getMarketplaceToolVersions', () => {
    it('should call GET with correct params and return value', async () => {
      const mockResponse = [
        { toolId: 'abc', version: '1.0.0' },
        { toolId: 'def', version: '2.1.0' }
      ];
      vi.mocked(GET).mockResolvedValueOnce(mockResponse);

      const result = await api.getMarketplaceToolVersions();
      expect(GET).toHaveBeenCalledWith('/marketplace/api/tool/versions');
      expect(result).toBe(mockResponse);
    });
  });
});
