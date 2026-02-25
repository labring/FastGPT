import { describe, it, expect } from 'vitest';
import { filterApiDatasetServerPublicData } from '@fastgpt/global/core/dataset/apiDataset/utils';
import type { ApiDatasetServerType } from '@fastgpt/global/core/dataset/apiDataset/type';

describe('filterApiDatasetServerPublicData', () => {
  // Test case 1: undefined input
  it('should return undefined when apiDatasetServer is undefined', () => {
    const result = filterApiDatasetServerPublicData(undefined);
    expect(result).toBeUndefined();
  });

  // Test case 2: empty object (all servers undefined)
  it('should return object with all undefined servers when input has no servers', () => {
    const input: ApiDatasetServerType = {};
    const result = filterApiDatasetServerPublicData(input);

    expect(result).toEqual({
      apiServer: undefined,
      yuqueServer: undefined,
      feishuServer: undefined
    });
  });

  // Test case 3: only apiServer exists
  it('should filter apiServer and clear authorization', () => {
    const input: ApiDatasetServerType = {
      apiServer: {
        baseUrl: 'https://api.example.com',
        authorization: 'secret-token-123',
        basePath: '/v1'
      }
    };
    const result = filterApiDatasetServerPublicData(input);

    expect(result).toEqual({
      apiServer: {
        baseUrl: 'https://api.example.com',
        authorization: '',
        basePath: '/v1'
      },
      yuqueServer: undefined,
      feishuServer: undefined
    });
  });

  // Test case 4: only yuqueServer exists
  it('should filter yuqueServer and clear token', () => {
    const input: ApiDatasetServerType = {
      yuqueServer: {
        userId: 'user-123',
        token: 'secret-yuque-token',
        basePath: '/docs'
      }
    };
    const result = filterApiDatasetServerPublicData(input);

    expect(result).toEqual({
      apiServer: undefined,
      yuqueServer: {
        userId: 'user-123',
        token: '',
        basePath: '/docs'
      },
      feishuServer: undefined
    });
  });

  // Test case 5: only feishuServer exists
  it('should filter feishuServer and clear appSecret', () => {
    const input: ApiDatasetServerType = {
      feishuServer: {
        appId: 'app-123',
        appSecret: 'secret-feishu-key',
        folderToken: 'folder-token-456'
      }
    };
    const result = filterApiDatasetServerPublicData(input);

    expect(result).toEqual({
      apiServer: undefined,
      yuqueServer: undefined,
      feishuServer: {
        appId: 'app-123',
        appSecret: '',
        folderToken: 'folder-token-456'
      }
    });
  });

  // Test case 6: all servers exist
  it('should filter all servers and clear sensitive fields', () => {
    const input: ApiDatasetServerType = {
      apiServer: {
        baseUrl: 'https://api.example.com',
        authorization: 'api-secret',
        basePath: '/api'
      },
      yuqueServer: {
        userId: 'yuque-user',
        token: 'yuque-secret',
        basePath: '/yuque'
      },
      feishuServer: {
        appId: 'feishu-app',
        appSecret: 'feishu-secret',
        folderToken: 'feishu-folder'
      }
    };
    const result = filterApiDatasetServerPublicData(input);

    expect(result).toEqual({
      apiServer: {
        baseUrl: 'https://api.example.com',
        authorization: '',
        basePath: '/api'
      },
      yuqueServer: {
        userId: 'yuque-user',
        token: '',
        basePath: '/yuque'
      },
      feishuServer: {
        appId: 'feishu-app',
        appSecret: '',
        folderToken: 'feishu-folder'
      }
    });
  });

  // Test case 7: servers with optional fields undefined
  it('should handle servers with optional fields as undefined', () => {
    const input: ApiDatasetServerType = {
      apiServer: {
        baseUrl: 'https://api.example.com'
        // authorization and basePath are optional
      },
      yuqueServer: {
        userId: 'user-id'
        // token and basePath are optional
      },
      feishuServer: {
        appId: 'app-id',
        folderToken: 'folder-token'
        // appSecret is optional
      }
    };
    const result = filterApiDatasetServerPublicData(input);

    expect(result).toEqual({
      apiServer: {
        baseUrl: 'https://api.example.com',
        authorization: '',
        basePath: undefined
      },
      yuqueServer: {
        userId: 'user-id',
        token: '',
        basePath: undefined
      },
      feishuServer: {
        appId: 'app-id',
        appSecret: '',
        folderToken: 'folder-token'
      }
    });
  });

  // Test case 8: two servers exist, one undefined
  it('should handle partial server configuration (apiServer and feishuServer)', () => {
    const input: ApiDatasetServerType = {
      apiServer: {
        baseUrl: 'https://api.example.com',
        authorization: 'token',
        basePath: '/path'
      },
      feishuServer: {
        appId: 'app',
        appSecret: 'secret',
        folderToken: 'folder'
      }
    };
    const result = filterApiDatasetServerPublicData(input);

    expect(result).toEqual({
      apiServer: {
        baseUrl: 'https://api.example.com',
        authorization: '',
        basePath: '/path'
      },
      yuqueServer: undefined,
      feishuServer: {
        appId: 'app',
        appSecret: '',
        folderToken: 'folder'
      }
    });
  });
});
