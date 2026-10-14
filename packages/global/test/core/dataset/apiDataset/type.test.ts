import { describe, expect, it } from 'vitest';
import { APIFileServerSchema } from '@fastgpt/global/core/dataset/apiDataset/type';

describe('APIFileServerSchema baseUrl', () => {
  it('prepends https when the protocol is missing', () => {
    expect(APIFileServerSchema.parse({ baseUrl: 'api.example.com' }).baseUrl).toBe(
      'https://api.example.com'
    );
    expect(APIFileServerSchema.parse({ baseUrl: '  api.example.com  ' }).baseUrl).toBe(
      'https://api.example.com'
    );
  });

  it('keeps an explicit http/https prefix', () => {
    expect(APIFileServerSchema.parse({ baseUrl: 'https://api.example.com' }).baseUrl).toBe(
      'https://api.example.com'
    );
    expect(APIFileServerSchema.parse({ baseUrl: 'http://api.example.com' }).baseUrl).toBe(
      'http://api.example.com'
    );
  });

  it('never rejects, so records saved before normalization still parse', () => {
    // 该 schema 同时用于读取历史记录：旧数据里的裸域名不能导致解析失败
    expect(APIFileServerSchema.safeParse({ baseUrl: '' }).success).toBe(true);
    expect(APIFileServerSchema.safeParse({ baseUrl: 'not a url at all' }).success).toBe(true);
    expect(
      APIFileServerSchema.safeParse({ baseUrl: 'api.example.com', authorization: 'token' }).success
    ).toBe(true);
  });
});
