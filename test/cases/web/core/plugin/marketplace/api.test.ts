import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as api from '@/web/core/plugin/marketplace/api';

vi.mock('@/web/common/api/request', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/web/common/api/request')>();
  return {
    ...actual,
    GET: vi.fn(),
    POST: vi.fn()
  };
});

import { GET, POST } from '@/web/common/api/request';

describe('marketplace/api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSystemInstalledPlugins', () => {
    it('should call GET with correct URL and data', async () => {
      vi.mocked(GET).mockResolvedValueOnce({ plugins: [], total: 0 });
      const query = { page: 1, pageSize: 10 };
      const result = await api.getSystemInstalledPlugins(query);
      expect(GET).toHaveBeenCalledWith('/core/plugin/admin/marketplace/installed', query);
      expect(result).toEqual({ plugins: [], total: 0 });
    });
  });

  describe('getMarketplaceTools', () => {
    it('should call POST with correct URL and data', async () => {
      const mockResponse = { data: [], total: 0, page: 1, pageSize: 10 };
      vi.mocked(POST).mockResolvedValueOnce(mockResponse);
      const body = { page: 1, pageSize: 10, tags: ['tag1'] };
      const result = await api.getMarketplaceTools(body);
      expect(POST).toHaveBeenCalledWith('/marketplace/api/tool/list', body);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getMarketplaceToolDetail', () => {
    it('should call GET with correct URL and data', async () => {
      const mockDetail = { id: 'tool1', name: 'Tool One', description: 'desc' };
      vi.mocked(GET).mockResolvedValueOnce(mockDetail);
      const query = { toolId: 'tool1' };
      const result = await api.getMarketplaceToolDetail(query);
      expect(GET).toHaveBeenCalledWith('/marketplace/api/tool/detail', query);
      expect(result).toEqual(mockDetail);
    });
  });

  describe('getMarketPlaceToolTags', () => {
    it('should call GET with correct URL and no data', async () => {
      const mockTags = { tags: ['tag1', 'tag2'] };
      vi.mocked(GET).mockResolvedValueOnce(mockTags);
      const result = await api.getMarketPlaceToolTags();
      expect(GET).toHaveBeenCalledWith('/marketplace/api/tool/tags');
      expect(result).toEqual(mockTags);
    });
  });

  describe('getMarketplaceDownloadURL', () => {
    it('should call GET with correct URL and toolId', async () => {
      const mockUrl = 'https://download.url/plugin.zip';
      vi.mocked(GET).mockResolvedValueOnce(mockUrl);
      const toolId = 'plugin123';
      const result = await api.getMarketplaceDownloadURL(toolId);
      expect(GET).toHaveBeenCalledWith('/marketplace/api/tool/getDownloadUrl', { toolId });
      expect(result).toEqual(mockUrl);
    });

    it('should handle empty toolId', async () => {
      const mockUrl = '';
      vi.mocked(GET).mockResolvedValueOnce(mockUrl);
      const toolId = '';
      const result = await api.getMarketplaceDownloadURL(toolId);
      expect(GET).toHaveBeenCalledWith('/marketplace/api/tool/getDownloadUrl', { toolId });
      expect(result).toEqual(mockUrl);
    });
  });
});
