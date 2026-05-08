import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalEnv = {
  STORAGE_S3_ENDPOINT: process.env.STORAGE_S3_ENDPOINT,
  STORAGE_EXTERNAL_ENDPOINT: process.env.STORAGE_EXTERNAL_ENDPOINT,
  STORAGE_S3_CDN_ENDPOINT: process.env.STORAGE_S3_CDN_ENDPOINT,
  FE_DOMAIN: process.env.FE_DOMAIN,
  PRO_URL: process.env.PRO_URL
};

describe('fileUrlValidator', () => {
  let originalSystemEnv: any;

  beforeEach(() => {
    originalSystemEnv = global.systemEnv;
    vi.resetModules();
    vi.stubEnv('STORAGE_S3_ENDPOINT', undefined);
    vi.stubEnv('STORAGE_EXTERNAL_ENDPOINT', undefined);
    vi.stubEnv('STORAGE_S3_CDN_ENDPOINT', undefined);
    vi.stubEnv('FE_DOMAIN', undefined);
    vi.stubEnv('PRO_URL', undefined);
  });

  afterEach(() => {
    vi.stubEnv('STORAGE_S3_ENDPOINT', originalEnv.STORAGE_S3_ENDPOINT);
    vi.stubEnv('STORAGE_EXTERNAL_ENDPOINT', originalEnv.STORAGE_EXTERNAL_ENDPOINT);
    vi.stubEnv('STORAGE_S3_CDN_ENDPOINT', originalEnv.STORAGE_S3_CDN_ENDPOINT);
    vi.stubEnv('FE_DOMAIN', originalEnv.FE_DOMAIN);
    vi.stubEnv('PRO_URL', originalEnv.PRO_URL);
    global.systemEnv = originalSystemEnv;
  });

  describe('systemWhiteList construction', () => {
    it('should include STORAGE_S3_ENDPOINT when set', async () => {
      vi.stubEnv('STORAGE_S3_ENDPOINT', 'http://s3.example.com');
      global.systemEnv = { fileUrlWhitelist: ['other.com'] } as any;
      const { validateFileUrlDomain } = await import(
        '@fastgpt/service/common/security/fileUrlValidator'
      );
      expect(validateFileUrlDomain('http://s3.example.com/file.png')).toBe(true);
    });

    it('should extract hostname from STORAGE_EXTERNAL_ENDPOINT', async () => {
      vi.stubEnv('STORAGE_EXTERNAL_ENDPOINT', 'https://external.example.com/path');
      global.systemEnv = { fileUrlWhitelist: ['other.com'] } as any;
      const { validateFileUrlDomain } = await import(
        '@fastgpt/service/common/security/fileUrlValidator'
      );
      expect(validateFileUrlDomain('http://external.example.com/file.png')).toBe(true);
    });

    it('should extract hostname from STORAGE_S3_CDN_ENDPOINT', async () => {
      vi.stubEnv('STORAGE_S3_CDN_ENDPOINT', 'https://cdn.example.com/files');
      global.systemEnv = { fileUrlWhitelist: ['other.com'] } as any;
      const { validateFileUrlDomain } = await import(
        '@fastgpt/service/common/security/fileUrlValidator'
      );
      expect(validateFileUrlDomain('http://cdn.example.com/file.png')).toBe(true);
    });

    it('should reject invalid STORAGE_EXTERNAL_ENDPOINT at env validation stage', async () => {
      vi.stubEnv('STORAGE_EXTERNAL_ENDPOINT', 'not-a-valid-url');
      global.systemEnv = { fileUrlWhitelist: ['other.com'] } as any;

      await expect(import('@fastgpt/service/common/security/fileUrlValidator')).rejects.toThrow(
        'Invalid environment variables. Please check: STORAGE_EXTERNAL_ENDPOINT'
      );
    });

    it('should extract hostname from FE_DOMAIN', async () => {
      vi.stubEnv('FE_DOMAIN', 'https://fe.example.com');
      global.systemEnv = { fileUrlWhitelist: ['other.com'] } as any;
      const { validateFileUrlDomain } = await import(
        '@fastgpt/service/common/security/fileUrlValidator'
      );
      expect(validateFileUrlDomain('http://fe.example.com/page')).toBe(true);
    });

    it('should reject invalid FE_DOMAIN at env validation stage', async () => {
      vi.stubEnv('FE_DOMAIN', 'invalid-url');
      global.systemEnv = { fileUrlWhitelist: ['other.com'] } as any;

      await expect(import('@fastgpt/service/common/security/fileUrlValidator')).rejects.toThrow(
        'Invalid environment variables. Please check: FE_DOMAIN'
      );
    });

    it('should extract hostname from PRO_URL', async () => {
      vi.stubEnv('PRO_URL', 'https://pro.example.com/api');
      global.systemEnv = { fileUrlWhitelist: ['other.com'] } as any;
      const { validateFileUrlDomain } = await import(
        '@fastgpt/service/common/security/fileUrlValidator'
      );
      expect(validateFileUrlDomain('http://pro.example.com/resource')).toBe(true);
    });

    it('should reject invalid PRO_URL at env validation stage', async () => {
      vi.stubEnv('PRO_URL', 'bad-url');
      global.systemEnv = { fileUrlWhitelist: ['other.com'] } as any;

      await expect(import('@fastgpt/service/common/security/fileUrlValidator')).rejects.toThrow(
        'Invalid environment variables. Please check: PRO_URL'
      );
    });

    it('should combine all env vars into systemWhiteList', async () => {
      vi.stubEnv('STORAGE_S3_ENDPOINT', 'http://s3.example.com');
      vi.stubEnv('STORAGE_EXTERNAL_ENDPOINT', 'https://external.example.com');
      vi.stubEnv('STORAGE_S3_CDN_ENDPOINT', 'https://cdn.example.com');
      vi.stubEnv('FE_DOMAIN', 'https://fe.example.com');
      vi.stubEnv('PRO_URL', 'https://pro.example.com');
      global.systemEnv = { fileUrlWhitelist: ['user.com'] } as any;
      const { validateFileUrlDomain } = await import(
        '@fastgpt/service/common/security/fileUrlValidator'
      );
      expect(validateFileUrlDomain('http://s3.example.com/f')).toBe(true);
      expect(validateFileUrlDomain('http://external.example.com/f')).toBe(true);
      expect(validateFileUrlDomain('http://cdn.example.com/f')).toBe(true);
      expect(validateFileUrlDomain('http://fe.example.com/f')).toBe(true);
      expect(validateFileUrlDomain('http://pro.example.com/f')).toBe(true);
      expect(validateFileUrlDomain('http://user.com/f')).toBe(true);
      expect(validateFileUrlDomain('http://unknown.com/f')).toBe(false);
    });
  });

  describe('validateFileUrlDomain', () => {
    it('should return true when fileUrlWhitelist is empty', async () => {
      global.systemEnv = { fileUrlWhitelist: [] } as any;
      const { validateFileUrlDomain } = await import(
        '@fastgpt/service/common/security/fileUrlValidator'
      );
      expect(validateFileUrlDomain('http://any-domain.com/file.png')).toBe(true);
    });

    it('should return true when fileUrlWhitelist is undefined', async () => {
      global.systemEnv = {} as any;
      const { validateFileUrlDomain } = await import(
        '@fastgpt/service/common/security/fileUrlValidator'
      );
      expect(validateFileUrlDomain('http://any-domain.com/file.png')).toBe(true);
    });

    it('should return true when systemEnv is undefined', async () => {
      global.systemEnv = undefined as any;
      const { validateFileUrlDomain } = await import(
        '@fastgpt/service/common/security/fileUrlValidator'
      );
      expect(validateFileUrlDomain('http://any-domain.com/file.png')).toBe(true);
    });

    it('should return true when URL hostname matches whitelist', async () => {
      global.systemEnv = { fileUrlWhitelist: ['allowed.com'] } as any;
      const { validateFileUrlDomain } = await import(
        '@fastgpt/service/common/security/fileUrlValidator'
      );
      expect(validateFileUrlDomain('https://allowed.com/path/file.png')).toBe(true);
    });

    it('should return false when URL hostname does not match', async () => {
      global.systemEnv = { fileUrlWhitelist: ['allowed.com'] } as any;
      const { validateFileUrlDomain } = await import(
        '@fastgpt/service/common/security/fileUrlValidator'
      );
      expect(validateFileUrlDomain('https://blocked.com/path/file.png')).toBe(false);
    });

    it('should return true for invalid URL (catch block)', async () => {
      global.systemEnv = { fileUrlWhitelist: ['allowed.com'] } as any;
      const { validateFileUrlDomain } = await import(
        '@fastgpt/service/common/security/fileUrlValidator'
      );
      expect(validateFileUrlDomain('not-a-valid-url')).toBe(true);
    });

    it('should skip null/undefined/non-string/empty domains', async () => {
      global.systemEnv = {
        fileUrlWhitelist: [null, undefined, 123, '', 'valid.com'] as any
      } as any;
      const { validateFileUrlDomain } = await import(
        '@fastgpt/service/common/security/fileUrlValidator'
      );
      expect(validateFileUrlDomain('https://valid.com/file')).toBe(true);
      expect(validateFileUrlDomain('https://other.com/file')).toBe(false);
    });

    it('should match against both fileUrlWhitelist and systemWhiteList', async () => {
      vi.stubEnv('STORAGE_S3_ENDPOINT', 'http://s3.system.com');
      global.systemEnv = { fileUrlWhitelist: ['user.com'] } as any;
      const { validateFileUrlDomain } = await import(
        '@fastgpt/service/common/security/fileUrlValidator'
      );
      expect(validateFileUrlDomain('http://user.com/file')).toBe(true);
      expect(validateFileUrlDomain('http://s3.system.com/file')).toBe(true);
      expect(validateFileUrlDomain('http://unknown.com/file')).toBe(false);
    });
  });
});
