import { describe, expect, it } from 'vitest';
import { APIFileServerSchema } from '@fastgpt/global/core/dataset/apiDataset/type';
import {
  ApiDatasetServerInputSchema,
  CreateDatasetBodySchema,
  UpdateDatasetBodySchema
} from '@fastgpt/global/openapi/core/dataset/api';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';

const objectId = '68ad85a7463006c963799a05';

describe('APIFileServerSchema (read side)', () => {
  it('keeps legacy bare domains unchanged and never rejects', () => {
    // 该 schema 同时用于读取历史记录和响应输出：不能改写或拒绝旧数据
    expect(APIFileServerSchema.parse({ baseUrl: 'api.example.com' }).baseUrl).toBe(
      'api.example.com'
    );
    expect(APIFileServerSchema.parse({ baseUrl: '  api.example.com  ' }).baseUrl).toBe(
      '  api.example.com  '
    );
    expect(APIFileServerSchema.safeParse({ baseUrl: '' }).success).toBe(true);
    expect(APIFileServerSchema.safeParse({ baseUrl: 'not a url at all' }).success).toBe(true);
    expect(
      APIFileServerSchema.safeParse({ baseUrl: 'api.example.com', authorization: 'token' }).success
    ).toBe(true);
  });
});

describe('ApiDatasetServerInputSchema (write side)', () => {
  it('accepts complete http/https addresses and trims surrounding whitespace', () => {
    expect(
      ApiDatasetServerInputSchema.parse({ apiServer: { baseUrl: ' https://api.example.com ' } })
    ).toEqual({ apiServer: { baseUrl: 'https://api.example.com' } });
    expect(
      ApiDatasetServerInputSchema.safeParse({ apiServer: { baseUrl: 'http://api.example.com' } })
        .success
    ).toBe(true);
  });

  it.each([
    'api.example.com',
    'api.example.com/v1',
    '',
    'https://',
    'ftp://api.example.com',
    'not a url at all'
  ])('rejects missing protocol or invalid baseUrl: %s', (baseUrl) => {
    const result = ApiDatasetServerInputSchema.safeParse({ apiServer: { baseUrl } });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['apiServer', 'baseUrl']);
    }
  });

  it('allows configs without an API server', () => {
    expect(ApiDatasetServerInputSchema.safeParse({}).success).toBe(true);
    expect(
      ApiDatasetServerInputSchema.safeParse({
        feishuServer: { appId: 'app', folderToken: 'folder' }
      }).success
    ).toBe(true);
  });
});

describe('dataset create/update contracts', () => {
  it('applies strict baseUrl validation when saving api datasets', () => {
    const invalidApiDatasetServer = {
      apiServer: { baseUrl: 'api.example.com' }
    };

    expect(
      CreateDatasetBodySchema.safeParse({
        parentId: null,
        type: DatasetTypeEnum.apiDataset,
        name: 'dataset',
        intro: '',
        apiDatasetServer: invalidApiDatasetServer
      }).success
    ).toBe(false);

    expect(
      UpdateDatasetBodySchema.safeParse({
        id: objectId,
        apiDatasetServer: invalidApiDatasetServer
      }).success
    ).toBe(false);

    expect(
      UpdateDatasetBodySchema.safeParse({
        id: objectId,
        apiDatasetServer: { apiServer: { baseUrl: 'https://api.example.com' } }
      }).success
    ).toBe(true);
  });
});
