import { describe, expect, it } from 'vitest';
import {
  APIFileServerSchema,
  ApiDatasetPermissionItemSchema,
  ApiDatasetServerSchema
} from '@fastgpt/global/core/dataset/apiDataset/type';
import {
  CreateDatasetBodySchema,
  UpdateDatasetBodySchema
} from '@fastgpt/global/openapi/core/dataset/api';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { OwnerRoleVal } from '@fastgpt/global/support/permission/constant';

const objectId = '68ad85a7463006c963799a05';

describe('APIFileServerSchema', () => {
  it('keeps complete http/https addresses and trims surrounding whitespace', () => {
    expect(APIFileServerSchema.parse({ baseUrl: ' https://api.example.com ' })).toEqual({
      baseUrl: 'https://api.example.com'
    });
    expect(
      APIFileServerSchema.parse({ baseUrl: 'http://localhost:3000', authorization: 'token' })
    ).toEqual({ baseUrl: 'http://localhost:3000', authorization: 'token' });
  });

  it.each([
    ['api.example.com', 'https://api.example.com'],
    ['api.example.com/v1', 'https://api.example.com/v1'],
    ['//api.example.com', 'https://api.example.com'],
    ['HTTPS://api.example.com', 'HTTPS://api.example.com'],
    // 其它显式协议原样保留，不会拼成 https://ftp://...
    ['ftp://api.example.com', 'ftp://api.example.com'],
    // 历史空值保持为空，避免存量记录解析失败
    ['', '']
  ])('normalizes baseUrl: %s -> %s', (baseUrl, expected) => {
    expect(APIFileServerSchema.parse({ baseUrl }).baseUrl).toBe(expected);
  });
});

describe('ApiDatasetServerSchema', () => {
  it('allows configs without an API server', () => {
    expect(ApiDatasetServerSchema.safeParse({}).success).toBe(true);
    expect(
      ApiDatasetServerSchema.safeParse({
        feishuServer: { appId: 'app', folderToken: 'folder' }
      }).success
    ).toBe(true);
  });

  it('normalizes legacy bare domains when parsing stored configs', () => {
    // detail 接口用 DatasetItemSchema 解析历史记录，存量裸域名必须能通过并归一化
    expect(ApiDatasetServerSchema.parse({ apiServer: { baseUrl: 'api.example.com' } })).toEqual({
      apiServer: { baseUrl: 'https://api.example.com' }
    });
  });
});

describe('dataset create/update contracts', () => {
  it('normalizes a bare-domain baseUrl when saving', () => {
    const parsed = CreateDatasetBodySchema.parse({
      parentId: null,
      type: DatasetTypeEnum.apiDataset,
      name: 'dataset',
      intro: '',
      apiDatasetServer: { apiServer: { baseUrl: 'api.example.com' } }
    });

    expect(parsed.apiDatasetServer?.apiServer?.baseUrl).toBe('https://api.example.com');
  });

  it('normalizes an updated baseUrl', () => {
    expect(
      UpdateDatasetBodySchema.parse({
        id: objectId,
        apiDatasetServer: { apiServer: { baseUrl: ' https://api.example.com ' } }
      }).apiDatasetServer?.apiServer?.baseUrl
    ).toBe('https://api.example.com');
  });
});

describe('apiDataset permission sync switches', () => {
  it('keeps the three switches optional so existing exact-equality contracts hold', () => {
    expect(
      ApiDatasetServerSchema.parse({ apiServer: { baseUrl: 'https://api.example.com' } })
    ).toEqual({ apiServer: { baseUrl: 'https://api.example.com' } });
  });

  it('accepts permissionSync only when the custom apiServer exists', () => {
    expect(
      ApiDatasetServerSchema.safeParse({
        apiServer: { baseUrl: 'https://api.example.com' },
        permissionSync: true,
        disableSuperAdmin: true,
        syncAllFiles: true
      }).success
    ).toBe(true);

    const result = ApiDatasetServerSchema.safeParse({ permissionSync: true });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['permissionSync']);

    // 非 custom provider 只开另外两个开关是合法的
    expect(
      ApiDatasetServerSchema.safeParse({
        feishuServer: { appId: 'app', folderToken: 'folder' },
        disableSuperAdmin: true,
        syncAllFiles: true
      }).success
    ).toBe(true);
  });

  it('exposes the switches on the update contract', () => {
    const parsed = UpdateDatasetBodySchema.parse({
      id: objectId,
      apiDatasetServer: {
        apiServer: { baseUrl: 'https://api.example.com' },
        permissionSync: true,
        syncAllFiles: true
      }
    });

    expect(parsed.apiDatasetServer?.permissionSync).toBe(true);
    expect(parsed.apiDatasetServer?.syncAllFiles).toBe(true);
  });
});

describe('ApiDatasetPermissionItemSchema', () => {
  it('accepts exactly one subject', () => {
    for (const item of [
      { username: 'alice', permission: 4 },
      { tmbId: 'tmb', permission: 2 },
      { groupId: 'group', permission: 1 },
      { orgId: 'org', permission: 4 }
    ]) {
      expect(ApiDatasetPermissionItemSchema.safeParse(item).success).toBe(true);
    }
  });

  it('rejects missing or multiple subjects', () => {
    expect(ApiDatasetPermissionItemSchema.safeParse({ permission: 4 }).success).toBe(false);
    expect(
      ApiDatasetPermissionItemSchema.safeParse({ username: 'alice', tmbId: 'tmb', permission: 4 })
        .success
    ).toBe(false);
  });

  it('accepts only the four ACL roles', () => {
    for (const permission of [4, 2, 1, OwnerRoleVal]) {
      expect(ApiDatasetPermissionItemSchema.safeParse({ tmbId: 'tmb', permission }).success).toBe(
        true
      );
    }
    // 7/6 这类组合掩码、0 和任意其他数字都不是单一位 role
    for (const permission of [7, 6, 3, 0, -1]) {
      expect(ApiDatasetPermissionItemSchema.safeParse({ tmbId: 'tmb', permission }).success).toBe(
        false
      );
    }
    expect(ApiDatasetPermissionItemSchema.safeParse({ tmbId: 'tmb' }).success).toBe(false);
  });
});
