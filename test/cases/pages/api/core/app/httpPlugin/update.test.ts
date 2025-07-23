import { describe, expect, it, vi } from 'vitest';
import { handler, type UpdateHttpPluginBody } from '@/pages/api/core/app/httpPlugin/update';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { refreshSourceAvatar } from '@fastgpt/service/common/file/image/controller';
import { onDelOneApp } from '@fastgpt/service/core/app/controller';
import { httpApiSchema2Plugins } from '@fastgpt/global/core/app/httpPlugin/utils';

// Mock MongoApp
vi.mock('@fastgpt/service/core/app/schema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/app/schema')>();
  return {
    ...actual,
    MongoApp: {
      findByIdAndUpdate: vi.fn(),
      find: vi.fn()
    }
  };
});

vi.mock('@fastgpt/service/common/file/image/controller', () => ({
  refreshSourceAvatar: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/controller', () => ({
  onDelOneApp: vi.fn()
}));

vi.mock('@fastgpt/global/core/app/httpPlugin/utils', () => ({
  httpApiSchema2Plugins: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authApp: vi.fn().mockResolvedValue({
    app: {
      _id: 'test-app-id',
      teamId: 'test-team-id',
      tmbId: 'test-tmb-id',
      pluginData: {
        apiSchemaStr: 'old-schema',
        customHeaders: {}
      },
      avatar: 'old-avatar'
    }
  })
}));

describe('HTTP Plugin Update API', () => {
  it('should update app without plugin data changes', async () => {
    const req = {
      body: {
        appId: 'test-app-id',
        name: 'Updated App',
        avatar: 'new-avatar',
        intro: 'Updated intro',
        pluginData: {
          apiSchemaStr: 'old-schema',
          customHeaders: {}
        }
      } as UpdateHttpPluginBody
    };

    const res = {
      json: vi.fn()
    };

    await handler(req as any, res as any);

    expect(MongoApp.findByIdAndUpdate).toHaveBeenCalledWith(
      'test-app-id',
      {
        name: 'Updated App',
        avatar: 'new-avatar',
        intro: 'Updated intro',
        pluginData: {
          apiSchemaStr: 'old-schema',
          customHeaders: {}
        }
      },
      expect.any(Object)
    );

    expect(refreshSourceAvatar).toHaveBeenCalledWith(
      'new-avatar',
      'old-avatar',
      expect.any(Object)
    );
  });

  it('should update app with plugin data changes', async () => {
    const req = {
      body: {
        appId: 'test-app-id',
        name: 'Updated App',
        pluginData: {
          apiSchemaStr: 'new-schema',
          customHeaders: { auth: 'token' }
        }
      } as UpdateHttpPluginBody
    };

    const mockPlugins = [
      {
        name: 'plugin1',
        pluginData: { pluginUniId: 'plugin1' }
      }
    ];

    vi.mocked(MongoApp.find).mockReturnValue({
      select: vi.fn().mockResolvedValue(mockPlugins)
    } as any);

    vi.mocked(httpApiSchema2Plugins).mockResolvedValue([
      {
        name: 'plugin1',
        pluginData: { pluginUniId: 'plugin1' }
      }
    ]);

    const res = {
      json: vi.fn()
    };

    await handler(req as any, res as any);

    expect(MongoApp.findByIdAndUpdate).toHaveBeenCalledWith(
      'test-app-id',
      {
        name: 'Updated App',
        pluginData: {
          apiSchemaStr: 'new-schema',
          customHeaders: { auth: 'token' }
        }
      },
      expect.any(Object)
    );

    expect(MongoApp.find).toHaveBeenCalledWith({
      parentId: 'test-app-id',
      teamId: 'test-team-id'
    });

    expect(httpApiSchema2Plugins).toHaveBeenCalledWith({
      parentId: 'test-app-id',
      apiSchemaStr: 'new-schema',
      customHeader: { auth: 'token' }
    });
  });

  it('should handle case when no plugin data is provided', async () => {
    const req = {
      body: {
        appId: 'test-app-id',
        name: 'Updated App'
      } as UpdateHttpPluginBody
    };

    const res = {
      json: vi.fn()
    };

    await handler(req as any, res as any);

    expect(MongoApp.findByIdAndUpdate).toHaveBeenCalledWith(
      'test-app-id',
      {
        name: 'Updated App'
      },
      expect.any(Object)
    );
  });
});
