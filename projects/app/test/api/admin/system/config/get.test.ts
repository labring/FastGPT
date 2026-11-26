import { describe, expect, it, vi } from 'vitest';
import { updateDomainConfig } from '@fastgpt/service/common/system/systemInstanceConfig/controller';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import { serviceEnv } from '@fastgpt/service/env';
import type { GetDomainConfigResponse } from '@fastgpt/global/openapi/admin/system/instanceConfig/api';

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: async () => ({ userId: 'root' })
}));

import handler from '@/pages/api/admin/system/config/get';

describe('instance config get API', () => {
  it('omits site branding fields from community admin responses', async () => {
    await updateDomainConfig({
      domain: 'site',
      expectedRevision: 0,
      submittedOverrides: {
        name: 'Commercial brand',
        favicon: '/commercial-logo.png',
        publicUrl: 'https://fastgpt.example.com'
      },
      actor: { actor: 'system' }
    });
    const getConfig = handler as unknown as (request: {
      query: { domain: string };
    }) => Promise<GetDomainConfigResponse>;
    const result = await getConfig({ query: { domain: 'site' } });
    expect(result.effectiveConfig).toEqual({ publicUrl: 'https://fastgpt.example.com' });
    expect(result.overrides).toEqual({ publicUrl: 'https://fastgpt.example.com' });
  });

  it('returns inline configured markers without returning stored or plaintext secrets', async () => {
    await updateDomainConfig({
      domain: 'providers',
      expectedRevision: 0,
      submittedOverrides: {
        documentParse: { customPdf: { url: 'https://pdf.example.com', key: 'private-api-key' } }
      },
      actor: { actor: 'admin' }
    });
    const stored = await MongoSystemInstanceConfig.findOne({ domain: 'providers' }).lean();
    const storedOverrides = stored?.overrides as
      | { documentParse?: { customPdf?: { key?: { secret: string } } } }
      | undefined;
    const cipher = storedOverrides?.documentParse?.customPdf?.key;
    expect(cipher).toEqual({ secret: expect.any(String) });

    const getConfig = handler as unknown as (request: {
      query: { domain: string };
    }) => Promise<GetDomainConfigResponse>;
    const result = await getConfig({ query: { domain: 'providers' } });
    expect(result.revision).toBe(1);
    expect(result.overrides).toHaveProperty(
      'documentParse.customPdf.url',
      'https://pdf.example.com'
    );
    expect(result.overrides).toHaveProperty('documentParse.customPdf.key', { isSecret: true });
    expect(result.effectiveConfig).toHaveProperty('documentParse.customPdf.key', {
      isSecret: true
    });
    expect(result.effectiveConfig).toHaveProperty('documentParse.customPdf.doc2xKey', '');
    expect(result).not.toHaveProperty('secretKeys');
    expect(result).not.toHaveProperty('configuredSecretKeys');
    const response = JSON.stringify(result);
    expect(response).not.toContain('private-api-key');
    expect(response).not.toContain(cipher?.secret ?? '');
    expect(response).not.toContain('******');
  });

  it('returns runtime storageCapabilities for domain=storage based on STORAGE_VENDOR', async () => {
    const getConfig = handler as unknown as (request: {
      query: { domain: string };
    }) => Promise<GetDomainConfigResponse>;
    const originalVendor = serviceEnv.STORAGE_VENDOR;

    try {
      Object.assign(serviceEnv, { STORAGE_VENDOR: 'r2' });
      const r2Result = await getConfig({ query: { domain: 'storage' } });
      expect(r2Result.storageCapabilities).toEqual({
        vendor: 'r2',
        supportsExternalEndpoint: false,
        supportsCdnEndpoint: false
      });

      Object.assign(serviceEnv, { STORAGE_VENDOR: 'oss' });
      const ossResult = await getConfig({ query: { domain: 'storage' } });
      expect(ossResult.storageCapabilities).toEqual({
        vendor: 'oss',
        supportsExternalEndpoint: false,
        supportsCdnEndpoint: true
      });

      const siteResult = await getConfig({ query: { domain: 'site' } });
      expect(siteResult.storageCapabilities).toBeUndefined();
    } finally {
      Object.assign(serviceEnv, { STORAGE_VENDOR: originalVendor });
    }
  });
});
