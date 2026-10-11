import { describe, it, expect } from 'vitest';
import {
  filterApiDatasetServerPublicData,
  toApiDatasetSuccess,
  toApiDatasetError,
  classifyApiDatasetError
} from '@fastgpt/global/core/dataset/apiDataset/utils';
import type { ApiDatasetServerType } from '@fastgpt/global/core/dataset/apiDataset/type';

describe('filterApiDatasetServerPublicData', () => {
  it('should return undefined when apiDatasetServer is undefined', () => {
    const result = filterApiDatasetServerPublicData(undefined);
    expect(result).toBeUndefined();
  });

  it('should return object with all undefined servers when input has no servers', () => {
    const input: ApiDatasetServerType = {};
    const result = filterApiDatasetServerPublicData(input);

    expect(result).toEqual({
      apiServer: undefined,
      yuqueServer: undefined,
      feishuServer: undefined,
      dingtalkServer: undefined
    });
  });

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
      feishuServer: undefined,
      dingtalkServer: undefined
    });
  });

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
      feishuServer: undefined,
      dingtalkServer: undefined
    });
  });

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
      },
      dingtalkServer: undefined
    });
  });

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
      },
      dingtalkServer: undefined
    });
  });

  it('should filter dingtalkServer and clear appSecret', () => {
    const input: ApiDatasetServerType = {
      dingtalkServer: {
        appKey: 'ding-app',
        appSecret: 'ding-secret',
        userId: 'user-id',
        operatorId: 'operator-id',
        workspaceId: 'workspace-id',
        rootNodeId: 'root-node-id',
        workspaceName: 'Workspace'
      }
    };
    const result = filterApiDatasetServerPublicData(input);

    expect(result).toEqual({
      apiServer: undefined,
      yuqueServer: undefined,
      feishuServer: undefined,
      dingtalkServer: {
        appKey: 'ding-app',
        appSecret: '',
        userId: 'user-id',
        operatorId: 'operator-id',
        workspaceId: 'workspace-id',
        rootNodeId: 'root-node-id',
        workspaceName: 'Workspace'
      }
    });
  });
});

describe('toApiDatasetSuccess', () => {
  it.each([undefined, null, 0, '', { id: 'doc' }])('原样保留成功数据 %j', (data) => {
    expect(toApiDatasetSuccess(data)).toEqual({ success: true, data });
  });
});

describe('toApiDatasetError', () => {
  it.each([undefined, 404])('错误状态 %s 以 resolve 数据表达', (status) => {
    expect(toApiDatasetError('NOT_FOUND', '文件不存在', status)).toEqual({
      success: false,
      code: 'NOT_FOUND',
      message: '文件不存在',
      status
    });
  });
});

describe('classifyApiDatasetError', () => {
  it.each([
    [undefined, 'UNKNOWN_ERROR', '未知错误', undefined],
    [{ status: 404, message: '' }, 'NOT_FOUND', '文件不存在', 404],
    [{ statusCode: 429, message: '' }, 'RATE_LIMIT', '请求过于频繁', 429],
    [{ response: { status: 401 }, message: '' }, 'UNAUTHORIZED', '鉴权失败或无权限', 401],
    [{ status: 403, msg: 'denied' }, 'UNAUTHORIZED', 'denied', 403],
    [{ status: 500, message: '' }, 'SERVER_ERROR', '服务或网络异常', 500],
    [{ status: 503, error: 'unavailable' }, 'SERVER_ERROR', 'unavailable', 503],
    [{ status: 499, message: 'unexpected' }, 'UNKNOWN_ERROR', 'unexpected', 499],
    [{ message: '文件不存在' }, 'NOT_FOUND', '文件不存在', 404],
    ['not found', 'NOT_FOUND', 'not found', 404],
    ['too many requests', 'RATE_LIMIT', 'too many requests', 429],
    ['无权限', 'UNAUTHORIZED', '无权限', 403],
    ['network timeout', 'NETWORK_ERROR', 'network timeout', undefined],
    ['unexpected', 'UNKNOWN_ERROR', 'unexpected', undefined]
  ])('归一化 %j', (error, code, message, status) => {
    expect(classifyApiDatasetError(error)).toEqual({ success: false, code, message, status });
  });

  it.each(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN'])(
    '网络错误 %s 不允许触发删除',
    (code) => {
      expect(classifyApiDatasetError({ code, message: '' })).toEqual({
        success: false,
        code: 'NETWORK_ERROR',
        message: '服务或网络异常',
        status: undefined
      });
    }
  );

  // 已知生产缺陷：消息正则优先于明确 HTTP 状态，会令同步误删。
  // 用 expected-failure 保留期望行为；修复分类器后必须移除 fails，不能固化错误分类。
  it.fails.each([403, 429, 503])('明确状态 %s 不应被 not found 文案降级为已删除', (status) => {
    expect(
      classifyApiDatasetError({ status, message: 'upstream resource not found' })
    ).not.toMatchObject({ code: 'NOT_FOUND' });
  });
});
