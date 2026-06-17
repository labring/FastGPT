import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';

const mocks = vi.hoisted(() => ({
  getLocale: vi.fn(),
  getSystemToolDetail: vi.fn(),
  getSystemToolDisplayInfo: vi.fn(),
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
      getSystemToolDetail: mocks.getSystemToolDetail,
      getSystemToolDisplayInfo: mocks.getSystemToolDisplayInfo
    });
  });

  it('returns empty paths when sourceId is empty', async () => {
    const result = await handler(
      { query: {} } as ApiRequestProps<Record<string, never>, { sourceId?: string }>,
      {} as ApiResponseType<any>
    );

    expect(result).toEqual([]);
    expect(mocks.getSystemToolDisplayInfo).not.toHaveBeenCalled();
  });

  it('returns current top-level system tool path', async () => {
    mocks.getSystemToolDisplayInfo.mockResolvedValueOnce({
      name: 'Weather'
    });

    const result = await handler(
      {
        query: {
          sourceId: 'systemTool-weather',
          type: 'current'
        }
      } as ApiRequestProps<Record<string, never>, { sourceId: string; type: 'current' }>,
      {} as ApiResponseType<any>
    );

    expect(result).toEqual([
      {
        parentId: 'systemTool-weather',
        parentName: 'Weather'
      }
    ]);
    expect(mocks.getSystemToolDisplayInfo).toHaveBeenCalledWith({
      pluginId: 'systemTool-weather',
      lang: 'en',
      source: 'system'
    });
    expect(mocks.getSystemToolDetail).not.toHaveBeenCalled();
  });

  it('returns parent and child paths for system toolset child', async () => {
    mocks.getSystemToolDisplayInfo.mockImplementation(({ pluginId }) =>
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
      } as ApiRequestProps<Record<string, never>, { sourceId: string; type: 'current' }>,
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
    mocks.getSystemToolDisplayInfo.mockResolvedValueOnce({
      name: 'Map'
    });

    const result = await handler(
      {
        query: {
          sourceId: 'systemTool-map/geocode',
          type: 'parent'
        }
      } as ApiRequestProps<Record<string, never>, { sourceId: string; type: 'parent' }>,
      {} as ApiResponseType<any>
    );

    expect(result).toEqual([
      {
        parentId: 'systemTool-map',
        parentName: 'Map'
      }
    ]);
    expect(mocks.getSystemToolDisplayInfo).toHaveBeenCalledTimes(1);
    expect(mocks.getSystemToolDetail).not.toHaveBeenCalled();
  });
});
