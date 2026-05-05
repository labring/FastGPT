import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';

const mocks = vi.hoisted(() => ({
  getLocale: vi.fn(),
  getSystemToolDetail: vi.fn(),
  getInstance: vi.fn()
}));

vi.mock('@fastgpt/service/common/middle/i18n', () => ({
  getLocale: mocks.getLocale
}));

vi.mock('@fastgpt/service/core/app/tool/systemTool/systemTool.repo', () => ({
  SystemToolRepo: {
    getInstance: mocks.getInstance
  }
}));

import { handler } from '@/pages/api/core/app/tool/path';

describe('system tool path handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLocale.mockReturnValue('en');
    mocks.getInstance.mockReturnValue({
      getSystemToolDetail: mocks.getSystemToolDetail
    });
  });

  it('returns empty paths when sourceId is empty', async () => {
    const result = await handler(
      { query: {} } as ApiRequestProps<{}, { sourceId?: string }>,
      {} as ApiResponseType<any>
    );

    expect(result).toEqual([]);
    expect(mocks.getSystemToolDetail).not.toHaveBeenCalled();
  });

  it('returns current top-level system tool path', async () => {
    mocks.getSystemToolDetail.mockResolvedValueOnce({
      name: 'Weather'
    });

    const result = await handler(
      {
        query: {
          sourceId: 'systemTool-weather',
          type: 'current'
        }
      } as ApiRequestProps<{}, { sourceId: string; type: 'current' }>,
      {} as ApiResponseType<any>
    );

    expect(result).toEqual([
      {
        parentId: 'systemTool-weather',
        parentName: 'Weather'
      }
    ]);
    expect(mocks.getSystemToolDetail).toHaveBeenCalledWith({
      pluginId: 'systemTool-weather',
      lang: 'en',
      source: 'system'
    });
  });

  it('returns parent and child paths for system toolset child', async () => {
    mocks.getSystemToolDetail.mockImplementation(({ pluginId }) =>
      Promise.resolve({
        name: pluginId === 'systemTool-map' ? 'Map' : 'Geocode'
      })
    );

    const result = await handler(
      {
        query: {
          sourceId: 'systemTool-map/geocode',
          type: 'current'
        }
      } as ApiRequestProps<{}, { sourceId: string; type: 'current' }>,
      {} as ApiResponseType<any>
    );

    expect(result).toEqual([
      {
        parentId: 'systemTool-map',
        parentName: 'Map'
      },
      {
        parentId: 'systemTool-map/geocode',
        parentName: 'Geocode'
      }
    ]);
  });

  it('returns only parent path when querying parent of system toolset child', async () => {
    mocks.getSystemToolDetail.mockResolvedValueOnce({
      name: 'Map'
    });

    const result = await handler(
      {
        query: {
          sourceId: 'systemTool-map/geocode',
          type: 'parent'
        }
      } as ApiRequestProps<{}, { sourceId: string; type: 'parent' }>,
      {} as ApiResponseType<any>
    );

    expect(result).toEqual([
      {
        parentId: 'systemTool-map',
        parentName: 'Map'
      }
    ]);
    expect(mocks.getSystemToolDetail).toHaveBeenCalledTimes(1);
  });
});
