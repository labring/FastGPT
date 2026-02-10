import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('fileUrlValidator', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    delete process.env.STORAGE_S3_ENDPOINT;
    delete process.env.STORAGE_EXTERNAL_ENDPOINT;
    // @ts-ignore
    delete process.env.FE_DOMAIN;
    delete process.env.PRO_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('systemWhiteList construction', () => {
    it('should include STORAGE_S3_ENDPOINT when set', async () => {
      process.env.STORAGE_S3_ENDPOINT = 's3.example.com';
      global.systemEnv = { fileUrlWhitelist: ['other.com'] } as any;
      const { validateFileUrlDomain } = await import(
        '@fastgpt/service/common/security/fileUrlValidator'
      );
      expect(validateFileUrlDomain('http://s3.example.com/file.png')).toBe(true);
    });

    it('should extract hostname from STORAGE_EXTERNAL_ENDPOINT', async () => {
      process.env.STORAGE_EXTERNAL_ENDPOINT = 'https://external.example.com/path';
      global.systemEnv = { fileUrlWhitelist: ['other.com'] } as any;
      const { validateFileUrlDomain } = await import(
        '@fastgpt/service/common/security/fileUrlValidator'
      );
      expect(validateFileUrlDomain('http://external.example.com/file.png')).toBe(true);
    });

    it('should handle invalid STORAGE_EXTERNAL_ENDPOINT gracefully', async () => {
      process.env.STORAGE_EXTERNAL_ENDPOINT = 'not-a-valid-url';
      global.systemEnv = { fileUrlWhitelist: ['other.com'] } as any;
      const { validateFileUrlDomain } = await import(
        '@fastgpt/service/common/security/fileUrlValidator'
      );
      expect(validateFileUrlDomain('http://other.com/file.png')).toBe(true);
      expect(validateFileUrlDomain('http://not-a-valid-url/file.png')).toBe(false);
    });

    it('should extract hostname from FE_DOMAIN', async () => {
      process.env.FE_DOMAIN = 'https://fe.example.com';
      global.systemEnv = { fileUrlWhitelist: ['other.com'] } as any;
      const { validateFileUrlDomain } = await import(
        '@fastgpt/service/common/security/fileUrlValidator'
      );
      expect(validateFileUrlDomain('http://fe.example.com/page')).toBe(true);
    });

    it('should handle invalid FE_DOMAIN gracefully', async () => {
      process.env.FE_DOMAIN = 'invalid-url';
      global.systemEnv = { fileUrlWhitelist: ['other.com'] } as any;
      const { validateFileUrlDomain } = await import(
        '@fastgpt/service/common/security/fileUrlValidator'
      );
      expect(validateFileUrlDomain('http://other.com/file.png')).toBe(true);
    });

    it('should extract hostname from PRO_URL', async () => {
      process.env.PRO_URL = 'https://pro.example.com/api';
      global.systemEnv = { fileUrlWhitelist: ['other.com'] } as any;
      const { validateFileUrlDomain } = await import(
        '@fastgpt/service/common/security/fileUrlValidator'
      );
      expect(validateFileUrlDomain('http://pro.example.com/resource')).toBe(true);
    });

    it('should handle invalid PRO_URL gracefully', async () => {
      process.env.PRO_URL = 'bad-url';
      global.systemEnv = { fileUrlWhitelist: ['other.com'] } as any;
      const { validateFileUrlDomain } = await import(
        '@fastgpt/service/common/security/fileUrlValidator'
      );
      expect(validateFileUrlDomain('http://other.com/file.png')).toBe(true);
    });

    it('should combine all env vars into systemWhiteList', async () => {
      process.env.STORAGE_S3_ENDPOINT = 's3.example.com';
      process.env.STORAGE_EXTERNAL_ENDPOINT = 'https://external.example.com';
      process.env.FE_DOMAIN = 'https://fe.example.com';
      process.env.PRO_URL = 'https://pro.example.com';
      global.systemEnv = { fileUrlWhitelist: ['user.com'] } as any;
      const { validateFileUrlDomain } = await import(
        '@fastgpt/service/common/security/fileUrlValidator'
      );
      expect(validateFileUrlDomain('http://s3.example.com/f')).toBe(true);
      expect(validateFileUrlDomain('http://external.example.com/f')).toBe(true);
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
      process.env.STORAGE_S3_ENDPOINT = 's3.system.com';
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
