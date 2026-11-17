import { resolveDomainEffectiveConfig } from '@fastgpt/global/common/system/config/schema';
import {
  createDefaultInstanceConfig,
  getTestInstanceConfig
} from '@test/utils/instanceConfigSnapshot';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalEnv = {
  STORAGE_S3_ENDPOINT: process.env.STORAGE_S3_ENDPOINT,
  STORAGE_EXTERNAL_ENDPOINT: process.env.STORAGE_EXTERNAL_ENDPOINT,
  STORAGE_S3_CDN_ENDPOINT: process.env.STORAGE_S3_CDN_ENDPOINT,
  FE_DOMAIN: process.env.FE_DOMAIN,
  PRO_URL: process.env.PRO_URL
};

describe('fileUrlValidator', () => {
  let originalSnapshot: typeof global.systemInstanceConfig;

  beforeEach(() => {
    originalSnapshot = global.systemInstanceConfig;
    // 存储端点改由 canonical 快照提供；路由 bundle 不执行启动注入
    global.systemInstanceConfig = createDefaultInstanceConfig();
    vi.resetModules();
    vi.stubEnv('STORAGE_S3_ENDPOINT', undefined);
    vi.stubEnv('STORAGE_EXTERNAL_ENDPOINT', undefined);
    vi.stubEnv('STORAGE_S3_CDN_ENDPOINT', undefined);
    getTestInstanceConfig().site.publicUrl = 'https://fastgpt.example.com';
    vi.stubEnv('PRO_URL', undefined);
  });

  afterEach(() => {
    vi.stubEnv('STORAGE_S3_ENDPOINT', originalEnv.STORAGE_S3_ENDPOINT);
    vi.stubEnv('STORAGE_EXTERNAL_ENDPOINT', originalEnv.STORAGE_EXTERNAL_ENDPOINT);
    vi.stubEnv('STORAGE_S3_CDN_ENDPOINT', originalEnv.STORAGE_S3_CDN_ENDPOINT);
    vi.stubEnv('FE_DOMAIN', originalEnv.FE_DOMAIN);
    vi.stubEnv('PRO_URL', originalEnv.PRO_URL);
    global.systemInstanceConfig = originalSnapshot;
  });

  it('only applies a non-empty allowlist when external file checking is enabled', async () => {
    const { validateFileUrlDomain } =
      await import('@fastgpt/service/common/security/fileUrlValidator');
    Object.assign(getTestInstanceConfig().security, {
      checkExternalFile: false,
      fileUrlWhitelist: ['allowed.com']
    });
    expect(validateFileUrlDomain('https://other.com/a.txt')).toBe(true);
    getTestInstanceConfig().security.checkExternalFile = true;
    expect(validateFileUrlDomain('https://other.com/a.txt')).toBe(false);
    expect(validateFileUrlDomain('https://allowed.com/a.txt')).toBe(true);
    getTestInstanceConfig().security.fileUrlWhitelist = [];
    expect(validateFileUrlDomain('https://other.com/a.txt')).toBe(true);
  });

  describe('systemWhiteList construction', () => {
    it('should include STORAGE_S3_ENDPOINT when set', async () => {
      vi.stubEnv('STORAGE_S3_ENDPOINT', 'http://s3.example.com');
      Object.assign(getTestInstanceConfig().security, {
        checkExternalFile: true,
        fileUrlWhitelist: ['other.com']
      });
      const { validateFileUrlDomain } =
        await import('@fastgpt/service/common/security/fileUrlValidator');
      expect(validateFileUrlDomain('http://s3.example.com/file.png')).toBe(true);
    });

    it('should extract hostname from the instance storage external endpoint', async () => {
      getTestInstanceConfig().storage.externalEndpoint = 'https://external.example.com/path';
      Object.assign(getTestInstanceConfig().security, {
        checkExternalFile: true,
        fileUrlWhitelist: ['other.com']
      });
      const { validateFileUrlDomain } =
        await import('@fastgpt/service/common/security/fileUrlValidator');
      expect(validateFileUrlDomain('http://external.example.com/file.png')).toBe(true);
    });

    it('should extract hostname from the instance storage CDN endpoint', async () => {
      getTestInstanceConfig().storage.externalEndpoint = 'https://external.example.com';
      getTestInstanceConfig().storage.cdnEndpoint = 'https://cdn.example.com/files';
      Object.assign(getTestInstanceConfig().security, {
        checkExternalFile: true,
        fileUrlWhitelist: ['other.com']
      });
      const { validateFileUrlDomain } =
        await import('@fastgpt/service/common/security/fileUrlValidator');
      expect(validateFileUrlDomain('http://cdn.example.com/file.png')).toBe(true);
    });

    it('rejects invalid external endpoints at the config boundary and ignores the retired ENV', async () => {
      vi.stubEnv('STORAGE_EXTERNAL_ENDPOINT', 'not-a-valid-url');
      Object.assign(getTestInstanceConfig().security, {
        checkExternalFile: true,
        fileUrlWhitelist: ['other.com']
      });

      expect(() =>
        resolveDomainEffectiveConfig({
          domain: 'storage',
          overrides: { externalEndpoint: 'not-a-valid-url' }
        })
      ).toThrow();
      await expect(
        import('@fastgpt/service/common/security/fileUrlValidator')
      ).resolves.toBeDefined();
    });

    it('should extract hostname from site.publicUrl', async () => {
      getTestInstanceConfig().site.publicUrl = 'https://fe.example.com';
      Object.assign(getTestInstanceConfig().security, {
        checkExternalFile: true,
        fileUrlWhitelist: ['other.com']
      });
      const { validateFileUrlDomain } =
        await import('@fastgpt/service/common/security/fileUrlValidator');
      expect(validateFileUrlDomain('http://fe.example.com/page')).toBe(true);
    });

    it('ignores the retired FE_DOMAIN and does not trust it as a site host', async () => {
      vi.stubEnv('FE_DOMAIN', 'invalid-url');
      Object.assign(getTestInstanceConfig().security, {
        checkExternalFile: true,
        fileUrlWhitelist: ['other.com']
      });

      getTestInstanceConfig().site.publicUrl = '';
      const { validateFileUrlDomain } =
        await import('@fastgpt/service/common/security/fileUrlValidator');
      expect(validateFileUrlDomain('https://fe.example.com/file')).toBe(false);
    });

    it('should extract hostname from PRO_URL', async () => {
      vi.stubEnv('PRO_URL', 'https://pro.example.com/api');
      Object.assign(getTestInstanceConfig().security, {
        checkExternalFile: true,
        fileUrlWhitelist: ['other.com']
      });
      const { validateFileUrlDomain } =
        await import('@fastgpt/service/common/security/fileUrlValidator');
      expect(validateFileUrlDomain('http://pro.example.com/resource')).toBe(true);
    });

    it('should reject invalid PRO_URL at env validation stage', async () => {
      vi.stubEnv('PRO_URL', 'bad-url');
      Object.assign(getTestInstanceConfig().security, {
        checkExternalFile: true,
        fileUrlWhitelist: ['other.com']
      });

      await expect(import('@fastgpt/service/common/security/fileUrlValidator')).rejects.toThrow(
        'Invalid environment variables. Please check: PRO_URL'
      );
    });

    it('should combine env vars and instance storage endpoints into systemWhiteList', async () => {
      // STORAGE_S3_ENDPOINT 在 serviceEnv 模块加载期解析，必须在首次导入前 stub
      vi.stubEnv('STORAGE_S3_ENDPOINT', 'http://s3.example.com');
      getTestInstanceConfig().site.publicUrl = 'https://fe.example.com';
      vi.stubEnv('PRO_URL', 'https://pro.example.com');
      getTestInstanceConfig().storage.externalEndpoint = 'https://external.example.com';
      getTestInstanceConfig().storage.cdnEndpoint = 'https://cdn.example.com';
      Object.assign(getTestInstanceConfig().security, {
        checkExternalFile: true,
        fileUrlWhitelist: ['user.com']
      });
      const { validateFileUrlDomain } =
        await import('@fastgpt/service/common/security/fileUrlValidator');
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
      Object.assign(getTestInstanceConfig().security, { fileUrlWhitelist: [] });
      const { validateFileUrlDomain } =
        await import('@fastgpt/service/common/security/fileUrlValidator');
      expect(validateFileUrlDomain('http://any-domain.com/file.png')).toBe(true);
    });

    it('should return true when fileUrlWhitelist is undefined', async () => {
      Object.assign(getTestInstanceConfig().security, {});
      const { validateFileUrlDomain } =
        await import('@fastgpt/service/common/security/fileUrlValidator');
      expect(validateFileUrlDomain('http://any-domain.com/file.png')).toBe(true);
    });

    it('should return true with default security settings', async () => {
      global.systemInstanceConfig = createDefaultInstanceConfig();
      const { validateFileUrlDomain } =
        await import('@fastgpt/service/common/security/fileUrlValidator');
      expect(validateFileUrlDomain('http://any-domain.com/file.png')).toBe(true);
    });

    it('should return true when URL hostname matches whitelist', async () => {
      Object.assign(getTestInstanceConfig().security, {
        checkExternalFile: true,
        fileUrlWhitelist: ['allowed.com']
      });
      const { validateFileUrlDomain } =
        await import('@fastgpt/service/common/security/fileUrlValidator');
      expect(validateFileUrlDomain('https://allowed.com/path/file.png')).toBe(true);
    });

    it('should return false when URL hostname does not match', async () => {
      Object.assign(getTestInstanceConfig().security, {
        checkExternalFile: true,
        fileUrlWhitelist: ['allowed.com']
      });
      const { validateFileUrlDomain } =
        await import('@fastgpt/service/common/security/fileUrlValidator');
      expect(validateFileUrlDomain('https://blocked.com/path/file.png')).toBe(false);
    });

    it('should return true for invalid URL (catch block)', async () => {
      Object.assign(getTestInstanceConfig().security, {
        checkExternalFile: true,
        fileUrlWhitelist: ['allowed.com']
      });
      const { validateFileUrlDomain } =
        await import('@fastgpt/service/common/security/fileUrlValidator');
      expect(validateFileUrlDomain('not-a-valid-url')).toBe(true);
    });

    it('should skip null/undefined/non-string/empty domains', async () => {
      Object.assign(getTestInstanceConfig().security, {
        checkExternalFile: true,
        fileUrlWhitelist: [null, undefined, 123, '', 'valid.com'] as any
      });
      const { validateFileUrlDomain } =
        await import('@fastgpt/service/common/security/fileUrlValidator');
      expect(validateFileUrlDomain('https://valid.com/file')).toBe(true);
      expect(validateFileUrlDomain('https://other.com/file')).toBe(false);
    });

    it('should match against both fileUrlWhitelist and systemWhiteList', async () => {
      vi.stubEnv('STORAGE_S3_ENDPOINT', 'http://s3.system.com');
      Object.assign(getTestInstanceConfig().security, {
        checkExternalFile: true,
        fileUrlWhitelist: ['user.com']
      });
      const { validateFileUrlDomain } =
        await import('@fastgpt/service/common/security/fileUrlValidator');
      expect(validateFileUrlDomain('http://user.com/file')).toBe(true);
      expect(validateFileUrlDomain('http://s3.system.com/file')).toBe(true);
      expect(validateFileUrlDomain('http://unknown.com/file')).toBe(false);
    });
  });
});
