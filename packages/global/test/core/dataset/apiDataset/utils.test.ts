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
    expect(toApiDatasetError({ code: 'NOT_FOUND', message: '文件不存在', status })).toEqual({
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

  it.each(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'ECONNABORTED', 'ERR_NETWORK'])(
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

  it.each([
    [403, 'UNAUTHORIZED'],
    [429, 'RATE_LIMIT'],
    [503, 'SERVER_ERROR'],
    [400, 'UNKNOWN_ERROR']
  ])('明确状态 %s 不被 not found 文案覆盖', (status, code) => {
    expect(
      classifyApiDatasetError({ status, message: 'upstream resource not found' })
    ).toMatchObject({ success: false, code, status });
  });

  it.each([
    [{ code: 'ECONNRESET', message: 'not found' }, 'NETWORK_ERROR', 'not found'],
    [{ code: 970003, message: 'not found' }, 'UNKNOWN_ERROR', 'not found'],
    [{ code: 'ERR_BAD_REQUEST', message: 'not found' }, 'UNKNOWN_ERROR', 'not found'],
    [
      { code: 'ECONNRESET', response: { data: { code: 'NOT_FOUND', message: 'missing' } } },
      'NETWORK_ERROR',
      'missing'
    ],
    [{ code: 'UNAUTHORIZED', message: 'not found' }, 'UNAUTHORIZED', 'not found'],
    [
      { response: { status: 403, data: { code: 'NOT_FOUND', msg: 'denied' } }, message: 'failed' },
      'UNAUTHORIZED',
      'denied'
    ],
    [{ response: { data: { error: 'network timeout' } } }, 'NETWORK_ERROR', 'network timeout'],
    [{ response: { data: '文件不存在' } }, 'NOT_FOUND', '文件不存在'],
    [{ data: 'too many requests' }, 'RATE_LIMIT', 'too many requests'],
    [{ message: 'forbidden: file not found' }, 'UNAUTHORIZED', 'forbidden: file not found'],
    [
      { message: 'network timeout: file not found' },
      'NETWORK_ERROR',
      'network timeout: file not found'
    ],
    [{ status: 200, message: '文件不存在' }, 'NOT_FOUND', '文件不存在'],
    [{ status: '503', message: 'unexpected' }, 'UNKNOWN_ERROR', 'unexpected']
  ])('保留结构化错误和旧协议文案 %#', (error, code, message) => {
    expect(classifyApiDatasetError(error)).toMatchObject({ success: false, code, message });
  });

  it.each([
    'NOT_FOUND',
    'RATE_LIMIT',
    'UNAUTHORIZED',
    'NETWORK_ERROR',
    'SERVER_ERROR',
    'INVALID_PARAMS',
    'UNKNOWN_ERROR'
  ])('已归一化协议 %s 不依赖文案再次判断', (code) => {
    expect(classifyApiDatasetError({ success: false, code, message: 'failed' })).toMatchObject({
      code
    });
  });
});
