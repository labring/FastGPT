import { describe, expect, it } from 'vitest';
import { UpdateDatasetBodySchema } from '@fastgpt/global/openapi/core/dataset/api';
import { stripPermissionSyncFromApiDatasetServer } from '@/pageComponents/dataset/detail/Info/components/EditApiServiceModal';

describe('stripPermissionSyncFromApiDatasetServer', () => {
  it('omits permissionSync=false so saving connection fields cannot disable concurrent permissionSync', () => {
    const payload = stripPermissionSyncFromApiDatasetServer({
      apiServer: {
        baseUrl: 'https://docs-new.example.com',
        authorization: 'Bearer token-1'
      },
      permissionSync: false
    });

    expect(payload).toEqual({
      apiServer: {
        baseUrl: 'https://docs-new.example.com',
        authorization: 'Bearer token-1'
      }
    });
    expect('permissionSync' in (payload ?? {})).toBe(false);

    const parsed = UpdateDatasetBodySchema.parse({
      id: '507f1f77bcf86cd799439011',
      apiDatasetServer: payload
    });
    expect(parsed.apiDatasetServer?.permissionSync).toBeUndefined();
    expect(parsed.apiDatasetServer?.apiServer?.baseUrl).toBe('https://docs-new.example.com');
  });

  it('omits permissionSync=true so saving connection fields cannot re-enable concurrently disabled permissionSync', () => {
    const payload = stripPermissionSyncFromApiDatasetServer({
      apiServer: {
        baseUrl: 'https://docs-updated.example.com',
        authorization: 'Bearer token-2'
      },
      permissionSync: true
    });

    expect(payload).toEqual({
      apiServer: {
        baseUrl: 'https://docs-updated.example.com',
        authorization: 'Bearer token-2'
      }
    });
    expect('permissionSync' in (payload ?? {})).toBe(false);

    const parsed = UpdateDatasetBodySchema.parse({
      id: '507f1f77bcf86cd799439011',
      apiDatasetServer: payload
    });
    expect(parsed.apiDatasetServer?.permissionSync).toBeUndefined();
    expect(parsed.apiDatasetServer?.apiServer?.baseUrl).toBe('https://docs-updated.example.com');
  });

  it('returns undefined when apiDatasetServer is omitted', () => {
    expect(stripPermissionSyncFromApiDatasetServer(undefined)).toBeUndefined();
  });
});
