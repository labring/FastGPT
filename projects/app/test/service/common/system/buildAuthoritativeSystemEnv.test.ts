import { describe, expect, it } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import { buildAuthoritativeSystemEnv } from '@/service/common/system/buildAuthoritativeSystemEnv';

describe('buildAuthoritativeSystemEnv', () => {
  it('instance config wins over legacy systemEnv for authoritative keys', () => {
    const instanceConfig = resolveSystemInstanceConfig({
      performance: { dataset: { parseMaxProcess: 42 } },
      vector: { hnswEfSearch: 200 },
      providers: { documentParse: { customPdf: { url: 'https://pdf.example.com' } } }
    });

    const result = buildAuthoritativeSystemEnv({
      legacySystemEnv: {
        datasetParseMaxProcess: 5,
        hnswEfSearch: 99,
        customPdfParse: { url: 'https://legacy.example.com' }
      } as any,
      instanceConfig
    });

    // 新 UI 编辑的值不能被旧库值覆盖
    expect(result.datasetParseMaxProcess).toBe(42);
    expect(result.hnswEfSearch).toBe(200);
    expect(result.customPdfParse?.url).toBe('https://pdf.example.com');
  });

  it('keeps legacy-only extension keys and customPdfParse.price', () => {
    const instanceConfig = resolveSystemInstanceConfig();

    const result = buildAuthoritativeSystemEnv({
      legacySystemEnv: {
        langfuse: { publicKey: 'pk', secretKey: 'sk', baseUrl: 'https://lf.example.com' },
        customPdfParse: { price: 0.01 },
        fileUrlWhitelist: ['https://allowed.example.com']
      } as any,
      instanceConfig
    });

    // schema 外/旧库独有字段必须原样保留
    expect(result.langfuse).toEqual({
      publicKey: 'pk',
      secretKey: 'sk',
      baseUrl: 'https://lf.example.com'
    });
    expect((result.customPdfParse as any)?.price).toBe(0.01);
    expect(result.fileUrlWhitelist).toEqual(['https://allowed.example.com']);
  });

  it('works with no legacy systemEnv at all', () => {
    const instanceConfig = resolveSystemInstanceConfig({ vector: { hnswEfSearch: 123 } });

    const result = buildAuthoritativeSystemEnv({ legacySystemEnv: undefined, instanceConfig });

    expect(result.hnswEfSearch).toBe(123);
    expect(result.customPdfParse).toBeDefined();
  });
});
